import { useEffect, useRef, useState, type HTMLAttributes } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { FiChevronDown, FiChevronUp, FiMessageCircle, FiPackage, FiPlus, FiSave, FiSliders } from 'react-icons/fi'
import {
  useCreateProductApiV1AdminProductsPost,
  useDeleteImageApiV1AdminProductsProductIdImagesImageIdDelete,
  useGetCharacteristicDefinitionsApiV1AdminCategoriesCategoryIdCharacteristicsGet,
  useGetFilterOptionsApiV1ProductsFiltersGet,
  useGetProductApiV1AdminProductsProductIdGet,
  useGetProductOptionsApiV1AdminProductOptionsGet,
  useReorderImagesApiV1AdminProductsProductIdImagesOrderPut,
  useUpdateProductApiV1AdminProductsProductIdPatch,
  useUploadImageApiV1AdminProductsProductIdImagesPost,
} from '../../api/generated/client'
import type { AdminProductCreate, AdminProductDetailOut, AdminProductUpdate, CharacteristicValueIn } from '../../api/generated/model'
import { ApiError } from '../../api/transport'
import { activeLocale, adminErrorText, formatMoney } from '../../admin/params'
import { invalidateAfterProductChange } from '../../admin/queryInvalidation'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { AdminTabs, type AdminTab } from '../../components/admin/AdminTabs'
import { adminTabId, adminTabPanelId } from '../../components/admin/adminTabIds'
import { AdminAlert, AdminError } from '../../components/admin/AdminFeedback'
import { AdminProductFormSkeleton } from '../../components/skeletons/AdminSkeletons'
import { SkeletonRegion } from '../../components/skeletons/SkeletonRegion'
import { Skeleton } from '../../components/ui/skeleton'
import { DeleteConfirmationModal } from '../../components/admin/DeleteConfirmationModal'
import { ProductGalleryEditor, type GalleryItem } from '../../components/admin/ProductGalleryEditor'
import { ProductReviewsPanel } from '../../components/admin/ProductReviewsPanel'
import {
  FloatingControl, SelectField, TextField, TextareaField, floatingInputClass,
} from '../../components/admin/AdminFields'
import {
  adminCard, adminControl, adminPrimaryButton, adminSecondaryButton,
} from '../../components/admin/adminStyles'
import {
  type CharacteristicDefinitionLike,
  type CharacteristicDraft,
  type StoredCharacteristic,
  buildCharacteristicPayload,
  draftFromValue,
  emptyDraft,
  fieldTypeOf,
  isDraftEmpty,
  MAX_LIST_ROWS,
  MAX_TEXT_LENGTH,
  orphanCodes,
  storedValueMap,
} from '../../admin/characteristicDrafts'
import {
  characteristicLabel,
  translateCharacteristicLabel,
  translateCharacteristicUnit,
} from '../../i18n/characteristics'

const MAX_IMAGES = 10
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const TABS_ID = 'product-tabs'

interface ProductFormState {
  name: string
  stock: string
  isActive: boolean
  description: string
  categoryId: string
  productTypeId: string
  manufacturerId: string
  color: string
  /** One editor draft per category-scoped characteristic `code`. */
  characteristics: Record<string, CharacteristicDraft>
}

/**
 * Price draft. `value` is the canonical decimal the draft represents, kept
 * independently of `text`/`locale` so switching UI language cannot change the
 * intended amount.
 */
interface PriceDraft {
  locale: string
  text: string
  value: string
}

const EMPTY_FORM: ProductFormState = {
  name: '', stock: '0', isActive: true, description: '',
  categoryId: '', productTypeId: '', manufacturerId: '', color: '', characteristics: {},
}

let galleryKey = 0
const nextGalleryKey = () => `gallery-${++galleryKey}`

/** Renders a canonical decimal amount with the active language's separators. */
function formatPriceInput(value: string): string {
  if (!value.trim()) return value
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return value
  return new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: 2 }).format(parsed)
}

/** Thousands grouping allowed in the integer part of the RU/EN price draft. */
const RU_INTEGER_PATTERN = /^(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)$/
const EN_INTEGER_PATTERN = /^(?:\d{1,3}(?:,\d{3})+|\d+)$/
const RU_GROUP_SEPARATORS = /[ \u00a0\u202f]/g
const FRACTION_PATTERN = /^\d+$/
/** The price is stored with two decimals, so more precision cannot be represented. */
const MAX_FRACTION_DIGITS = 2

/** Reason a price draft cannot be submitted. */
type PriceIssue = 'format' | 'precision'

/**
 * Classifies a price draft against the active locale.
 *
 * The active language defines exactly one decimal separator (`,` in RU, `.` in
 * EN) and one optional thousands separator (` ` in RU, `,` in EN), each valid
 * only in its own position. Any other combination — for example `0,50` typed in
 * EN or `1.234,56` typed in RU — is a `format` issue, while a well-formed amount
 * with more than two fractional digits (`0,001`) is a `precision` issue.
 */
function priceInputIssue(text: string, locale: string): PriceIssue | null {
  const raw = text.trim()
  if (!raw) return null
  const english = locale.startsWith('en')
  const parts = raw.split(english ? '.' : ',')
  if (parts.length > 2) return 'format'
  const [integer = '', fraction] = parts
  if (!(english ? EN_INTEGER_PATTERN : RU_INTEGER_PATTERN).test(integer)) return 'format'
  if (fraction === undefined) return null
  if (!FRACTION_PATTERN.test(fraction)) return 'format'
  return fraction.length > MAX_FRACTION_DIGITS ? 'precision' : null
}

/**
 * Locale-aware price parsing that never reinterprets a separator and never
 * silently rounds: an input the backend cannot store exactly is rejected.
 *
 * @returns the canonical decimal string (`.` as the decimal separator) or null.
 */
function parsePriceInput(text: string, locale: string): string | null {
  if (priceInputIssue(text, locale) !== null) return null
  const english = locale.startsWith('en')
  const [integer = '', fraction] = text.trim().split(english ? '.' : ',')
  const digits = english ? integer.replace(/,/g, '') : integer.replace(RU_GROUP_SEPARATORS, '')
  const canonical = fraction === undefined ? digits : `${digits}.${fraction}`
  return Number.isFinite(Number(canonical)) ? canonical : null
}

function priceDraftFromText(text: string, locale: string): PriceDraft {
  return { locale, text, value: parsePriceInput(text, locale) ?? '' }
}

function formFromProduct(product: AdminProductDetailOut): ProductFormState {
  return {
    name: product.name,
    stock: String(product.stock_quantity),
    isActive: product.is_active,
    description: product.description,
    categoryId: String(product.category.id),
    productTypeId: String(product.product_type.id),
    manufacturerId: String(product.manufacturer.id),
    color: product.color ?? '',
    characteristics: draftsFrom(product),
  }
}

/** Values the API currently stores, keyed by characteristic code. */
function storedCharacteristicsOf(
  product: AdminProductDetailOut,
): Record<string, StoredCharacteristic> {
  return Object.fromEntries(
    (product.characteristics ?? []).map((row) => [
      row.code,
      { value: row.value, dataType: row.data_type },
    ]),
  )
}

/** Editable drafts of the values the API currently stores. */
function draftsFrom(
  product: AdminProductDetailOut,
): Record<string, CharacteristicDraft> {
  return Object.fromEntries(
    (product.characteristics ?? []).map((row) => [
      row.code,
      draftFromValue(row.data_type, row.value),
    ]),
  )
}

/**
 * Re-applies a server-confirmed image order to the current items. Items unknown
 * to that order (new uploads) and items deleted meanwhile keep their relative
 * position, so a failed reorder never resurrects a removed image.
 */
function applyServerOrder(items: GalleryItem[], order: readonly number[]): GalleryItem[] {
  const rank = new Map(order.map((id, index) => [id, index]))
  const fallback = order.length
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftRank = left.item.id === undefined ? fallback : rank.get(left.item.id) ?? fallback
      const rightRank = right.item.id === undefined ? fallback : rank.get(right.item.id) ?? fallback
      return leftRank === rightRank ? left.index - right.index : leftRank - rightRank
    })
    .map((entry) => entry.item)
}

export function AdminProductFormPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { productId } = useParams<{ productId: string }>()
  const queryClient = useQueryClient()

  const numericId = productId ? Number(productId) : 0
  const validId = Number.isSafeInteger(numericId) && numericId > 0
  const isEdit = productId !== undefined
  const tab = isEdit && searchParams.get('tab') === 'reviews' ? 'reviews' : 'product'
  const flashCreated = Boolean((location.state as { created?: boolean } | null)?.created)

  const detail = useGetProductApiV1AdminProductsProductIdGet(numericId, {
    query: { enabled: isEdit && validId, retry: false },
  })
  const options = useGetProductOptionsApiV1AdminProductOptionsGet()
  const filterOptions = useGetFilterOptionsApiV1ProductsFiltersGet()

  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM)
  /**
   * Values the API currently stores, keyed by characteristic code.
   *
   * Kept apart from the editable drafts because the two answer different
   * questions: a draft says what the administrator wants the value to be, while
   * this map says whether the product already has a row that clearing the field
   * has to delete explicitly.
   */
  const [storedCharacteristics, setStoredCharacteristics] = useState<Record<string, StoredCharacteristic>>({})
  const [price, setPrice] = useState<PriceDraft>({ locale: activeLocale(), text: '', value: '' })
  const [items, setItems] = useState<GalleryItem[]>([])
  const formKey = isEdit ? `edit-${numericId}` : 'create'
  const [loadedKey, setLoadedKey] = useState<string | null>(isEdit ? null : 'create')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [specsError, setSpecsError] = useState<string | null>(null)
  const [characteristicErrors, setCharacteristicErrors] = useState<Record<string, string>>({})
  /**
   * Signature of the category transition the administrator explicitly confirmed.
   *
   * A plain boolean would authorize a removal for *any* later transition: a
   * confirmation given for one category would then delete characteristics during
   * the next one. The signature binds a single confirmation to one target category
   * and one exact set of stored codes, so neither a category change nor a changed
   * orphan set can ever match it again.
   */
  const [removalConfirmation, setRemovalConfirmation] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [galleryError, setGalleryError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [specsOpen, setSpecsOpen] = useState(true)

  const [createdProduct, setCreatedProduct] = useState<AdminProductDetailOut | null>(null)
  const [uploadFailures, setUploadFailures] = useState(0)
  const [orderFailed, setOrderFailed] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<GalleryItem | null>(null)

  const uploadedIdsRef = useRef<Map<string, number>>(new Map())
  const previewUrlsRef = useRef<Set<string>>(new Set())
  /** Last order confirmed by the server; rollback is based on it, not on a stale array. */
  const serverOrderRef = useRef<number[]>([])
  /**
   * Identity of the form flow that owns the in-flight uploads.
   *
   * A product creation can keep uploading after the administrator has already
   * left the page. Bumping the token on unmount (and whenever the route switches
   * to another product) makes every older continuation stale, so a late upload
   * can no longer redirect the user back to the editor it was created from.
   */
  const flowTokenRef = useRef(0)
  /**
   * Synchronous guard for every server-side gallery mutation.
   *
   * Disabled buttons rely on asynchronous React state, which cannot stop a second
   * click or a drag from starting an incompatible request while an upload, an
   * ordering request or a deletion is still in flight. Only complete top-level
   * workflows acquire this lock; the internal upload/order helpers always run
   * inside an already held lock and never acquire it again.
   */
  const galleryLockRef = useRef(false)
  const acquireGalleryLock = () => {
    if (galleryLockRef.current) return false
    galleryLockRef.current = true
    return true
  }
  const releaseGalleryLock = () => { galleryLockRef.current = false }

  const locale = activeLocale()
  const priceText = price.locale === locale ? price.text : formatPriceInput(price.value)
  const pricePlaceholder = locale === 'en-GB' ? '0.00' : '0,00'
  const changePrice = (text: string) => {
    setPrice(priceDraftFromText(text, locale))
    setFieldErrors((current) => ({ ...current, price: '' }))
    setServerError(null)
    setSaved(false)
  }

  const categoryId = form.categoryId ? Number(form.categoryId) : 0
  // Definitions are category-scoped: every product type inside the category
  // shares them, so the editor is keyed by the category, not by the type.
  const definitions = useGetCharacteristicDefinitionsApiV1AdminCategoriesCategoryIdCharacteristicsGet(categoryId, {
    query: { enabled: categoryId > 0, retry: false },
  })
  const definitionFields = definitions.data?.fields

  const createProduct = useCreateProductApiV1AdminProductsPost()
  const updateProduct = useUpdateProductApiV1AdminProductsProductIdPatch()
  const uploadImage = useUploadImageApiV1AdminProductsProductIdImagesPost()
  const reorderImages = useReorderImagesApiV1AdminProductsProductIdImagesOrderPut()
  const deleteImage = useDeleteImageApiV1AdminProductsProductIdImagesImageIdDelete()

  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrlsRef.current.clear()
    // Leaving the page invalidates the flow that any pending upload belongs to.
    flowTokenRef.current += 1
  }, [])

  // The product detail is external server state: hydrate the editable draft once
  // per route. `loadedKey` guards later detail refetches so unsaved edits survive.
  // oxlint-disable react/set-state-in-effect
  useEffect(() => {
    if (loadedKey === formKey) return
    // A different product (or a fresh create form) is a different flow.
    flowTokenRef.current += 1
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrlsRef.current.clear()
    uploadedIdsRef.current.clear()
    serverOrderRef.current = []
    setCreatedProduct(null)
    setUploadFailures(0)
    setOrderFailed(false)
    setUploading(false)
    setFieldErrors({})
    setSpecsError(null)
    setCharacteristicErrors({})
    setRemovalConfirmation(null)
    setServerError(null)
    setGalleryError(null)
    setSaved(false)
    setRemoveTarget(null)
    if (!isEdit) {
      setForm(EMPTY_FORM)
      setStoredCharacteristics({})
      setPrice({ locale: activeLocale(), text: '', value: '' })
      setItems([])
      setLoadedKey(formKey)
      return
    }
    const data = detail.data
    if (!data) return
    const images = data.images ?? []
    setForm(formFromProduct(data))
    setStoredCharacteristics(storedCharacteristicsOf(data))
    setPrice(priceDraftFromText(formatPriceInput(data.price), activeLocale()))
    setItems(images.map((image) => ({
      key: `image-${image.id}`,
      id: image.id,
      url: image.url,
      altText: image.alt_text,
    })))
    serverOrderRef.current = images.map((image) => image.id)
    images.forEach((image) => uploadedIdsRef.current.set(`image-${image.id}`, image.id))
    setLoadedKey(formKey)
  }, [formKey, isEdit, detail.data, loadedKey])
  // oxlint-enable react/set-state-in-effect

  const changeField = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: '' }))
    setServerError(null)
    setSaved(false)
  }

  const changeCategory = (value: string) => {
    setForm((current) => ({
      ...current,
      categoryId: value,
      productTypeId: '',
      // Definitions are category-scoped, so drafts of the previous category no
      // longer apply. The stored codes they replace are tracked so a transition
      // can only discard them after an explicit confirmation.
      characteristics: {},
    }))
    // A confirmation given for the previous target category must never authorize
    // a removal in the newly selected one.
    setRemovalConfirmation(null)
    setFieldErrors((current) => ({ ...current, categoryId: '' }))
    setSpecsError(null)
    setSaved(false)
  }

  const changeProductType = (value: string) => {
    const nextType = (options.data?.categories ?? [])
      .flatMap((group) => group.product_types ?? [])
      .find((type) => String(type.id) === value)
    // A product type declares its own category. Reading it from the type instead
    // of the option group keeps the definitions right when the server scoped the
    // type to another category after the options were loaded.
    const nextCategoryId = nextType ? String(nextType.category_id) : form.categoryId
    const categoryChanged = nextCategoryId !== form.categoryId
    setForm((current) => ({
      ...current,
      productTypeId: value,
      categoryId: nextCategoryId,
      characteristics: categoryChanged ? {} : current.characteristics,
    }))
    // Only a category change invalidates the confirmation: a type of the same
    // category keeps the same definitions, so the confirmed orphan set is intact.
    if (categoryChanged) setRemovalConfirmation(null)
    setFieldErrors((current) => ({ ...current, productTypeId: '', categoryId: '' }))
    setSpecsError(null)
    setSaved(false)
  }

  const changeDraft = (code: string, dataType: string, patch: Partial<CharacteristicDraft>) => {
    setForm((current) => ({
      ...current,
      characteristics: {
        ...current.characteristics,
        [code]: { ...(current.characteristics[code] ?? emptyDraft(dataType)), ...patch },
      },
    }))
    setCharacteristicErrors((current) => ({ ...current, [code]: '' }))
    setSpecsError(null)
    setSaved(false)
  }

  const invalidateCatalog = () => {
    void invalidateAfterProductChange(queryClient)
  }

  /** True while this page still hosts the flow that started at `token`. */
  const isCurrentFlow = (token: number) => flowTokenRef.current === token

  const validateFiles = (files: File[]): File[] | null => {
    if (items.length + files.length > MAX_IMAGES) {
      setGalleryError(t('admin.form.gallery_limit_error'))
      return null
    }
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setGalleryError(t('admin.form.gallery_type_error'))
        return null
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setGalleryError(t('admin.form.gallery_size_error'))
        return null
      }
    }
    setGalleryError(null)
    return files
  }

  const markItem = (key: string, patch: Partial<GalleryItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  const trackPreviews = (newItems: GalleryItem[]) => {
    newItems.forEach((item) => { if (item.previewUrl) previewUrlsRef.current.add(item.previewUrl) })
    setItems((current) => [...current, ...newItems])
  }

  const releasePreview = (item: GalleryItem) => {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl)
      previewUrlsRef.current.delete(item.previewUrl)
    }
  }

  /**
   * Uploads only items that have no server id yet. An image accepted by the
   * server keeps its id, so retrying an ordering failure never uploads it twice.
   *
   * Returns how many images the server actually accepted: uploading and ordering
   * are separate mutations, so an accepted image must refresh the cache even when
   * the following order request fails.
   */
  const uploadNewItems = async (id: number, source: GalleryItem[]): Promise<{ accepted: number; failures: number }> => {
    let accepted = 0
    let failures = 0
    for (const item of source) {
      if (!item.file) continue
      if (item.id !== undefined || uploadedIdsRef.current.has(item.key)) continue
      markItem(item.key, { uploading: true, failed: false })
      try {
        const image = await uploadImage.mutateAsync({ productId: id, data: { file: item.file } })
        uploadedIdsRef.current.set(item.key, image.id)
        accepted += 1
        markItem(item.key, { uploading: false, failed: false, id: image.id, url: image.url })
      } catch (error) {
        failures += 1
        markItem(item.key, { uploading: false, failed: true })
        setGalleryError(adminErrorText(error))
      }
    }
    return { accepted, failures }
  }

  const knownIds = (source: GalleryItem[], extra?: { key: string; id: number }): number[] =>
    source
      .map((item) => (extra && item.key === extra.key ? extra.id : item.id ?? uploadedIdsRef.current.get(item.key)))
      .filter((value): value is number => typeof value === 'number')

  /** Persists the given cover order; returns false when the server rejected it. */
  const persistOrderIds = async (id: number, ids: number[]): Promise<boolean> => {
    if (ids.length === 0) return true
    try {
      await reorderImages.mutateAsync({ productId: id, data: { image_ids: ids } })
      serverOrderRef.current = ids
      setOrderFailed(false)
      // The earlier failure message must not survive a successful retry.
      setGalleryError(null)
      return true
    } catch (error) {
      setGalleryError(adminErrorText(error))
      setOrderFailed(true)
      return false
    }
  }

  /** Uploads pending files, then persists their order once all of them are accepted. */
  const uploadPending = async (
    id: number,
    source: GalleryItem[],
  ): Promise<{ accepted: number; failures: number; orderSaved: boolean }> => {
    const { accepted, failures } = await uploadNewItems(id, source)
    if (failures > 0) return { accepted, failures, orderSaved: false }
    const orderSaved = await persistOrderIds(id, knownIds(source))
    return { accepted, failures, orderSaved }
  }

  const handleAddFiles = (files: File[]) => {
    if (!acquireGalleryLock()) return
    const accepted = validateFiles(files)
    if (!accepted) {
      releaseGalleryLock()
      return
    }
    const newItems: GalleryItem[] = accepted.map((file) => ({
      key: nextGalleryKey(),
      file,
      previewUrl: URL.createObjectURL(file),
      uploading: isEdit && createdProduct === null,
    }))
    trackPreviews(newItems)
    if (!isEdit || createdProduct) {
      // Local-only change: nothing has been sent to the server yet.
      releaseGalleryLock()
      return
    }

    // Edit mode: the product exists, so images upload immediately.
    void (async () => {
      setUploading(true)
      try {
        const result = await uploadNewItems(numericId, newItems)
        setUploadFailures(result.failures)
        // A committed image changes the catalog even when a sibling upload fails
        // or the following order request is rejected.
        if (result.accepted > 0) invalidateCatalog()
        if (result.failures === 0) {
          const orderSaved = await persistOrderIds(numericId, knownIds([...items, ...newItems]))
          if (orderSaved) invalidateCatalog()
        }
        if (result.failures === 0 && detail.data) void detail.refetch()
      } catch (error) {
        setGalleryError(adminErrorText(error))
      } finally {
        setUploading(false)
        releaseGalleryLock()
      }
    })()
  }

  const retryItem = (key: string) => {
    const item = items.find((entry) => entry.key === key)
    if (!item?.file) return
    const id = createdProduct?.id ?? (isEdit ? numericId : null)
    if (!id) return
    // A second click (or any other gallery mutation) is rejected synchronously.
    if (!acquireGalleryLock()) return
    void (async () => {
      // Locks the gallery so an upload retry cannot race a reorder or a delete.
      setUploading(true)
      markItem(key, { uploading: true, failed: false })
      try {
        const image = await uploadImage.mutateAsync({ productId: id, data: { file: item.file as File } })
        uploadedIdsRef.current.set(key, image.id)
        markItem(key, { uploading: false, failed: false, id: image.id, url: image.url })
        setUploadFailures((current) => Math.max(0, current - 1))
        // The image is committed: refresh the catalog before ordering, which is a
        // separate request that may still fail.
        invalidateCatalog()
        // Ordering is a separate request: an accepted image is never re-uploaded.
        const orderSaved = await persistOrderIds(id, knownIds(items, { key, id: image.id }))
        if (orderSaved) {
          // Same cache contract as a normal upload, delete or reorder.
          invalidateCatalog()
          if (detail.data) void detail.refetch()
        }
      } catch (error) {
        markItem(key, { uploading: false, failed: true })
        setGalleryError(adminErrorText(error))
      } finally {
        setUploading(false)
        releaseGalleryLock()
      }
    })()
  }

  /**
   * Creation-mode batch retry: retries only the uploads that failed, persists the
   * image order, refreshes the catalog and only then reports success.
   */
  const retryUploads = () => {
    const product = createdProduct
    if (!product || !acquireGalleryLock()) return
    const flowToken = flowTokenRef.current
    setUploading(true)
    void (async () => {
      try {
        const result = await uploadPending(product.id, items)
        // Committed images must refresh the cache even when the ordering request
        // failed or the administrator already left this page.
        if (result.accepted > 0) invalidateCatalog()
        // Navigation is only allowed while this page still owns the flow.
        if (!isCurrentFlow(flowToken)) return
        setUploadFailures(result.failures)
        setOrderFailed(!result.orderSaved)
        if (result.failures === 0 && result.orderSaved) {
          // The product row was created earlier and already invalidated the
          // catalog; this retry stored the images, so it refreshes them again.
          invalidateCatalog()
          navigate(`/admin/products/${product.id}/edit`, { replace: true, state: { created: true } })
        }
      } catch (error) {
        setGalleryError(adminErrorText(error))
      } finally {
        setUploading(false)
        releaseGalleryLock()
      }
    })()
  }

  const reorder = (fromIndex: number, toIndex: number) => {
    // The cover order changes here: incompatible with any pending gallery request.
    if (!acquireGalleryLock()) return
    const next = [...items]
    const [moved] = next.splice(fromIndex, 1)
    if (!moved) {
      releaseGalleryLock()
      return
    }
    next.splice(toIndex, 0, moved)
    setItems(next)
    const allUploaded = next.every((item) => item.id !== undefined || uploadedIdsRef.current.has(item.key))
    if (!isEdit || createdProduct || !allUploaded) {
      // Every image must have a server id before the order can be persisted.
      releaseGalleryLock()
      return
    }
    const ids = knownIds(next)
    void reorderImages
      .mutateAsync({ productId: numericId, data: { image_ids: ids } })
      .then(() => {
        serverOrderRef.current = ids
        setOrderFailed(false)
        setGalleryError(null)
        invalidateCatalog()
        if (detail.data) void detail.refetch()
      })
      .catch((error) => {
        setGalleryError(adminErrorText(error))
        // Roll back to the last server-confirmed order, keeping only images that
        // still exist locally so a deleted image is never resurrected.
        setItems((current) => applyServerOrder(current, serverOrderRef.current))
      })
      .finally(releaseGalleryLock)
  }

  const removeItem = (key: string) => {
    // Opening the removal dialog while another gallery request runs would allow
    // a deletion to race the pending upload or ordering.
    if (galleryLockRef.current || reorderImages.isPending || deleteImage.isPending) return
    const item = items.find((entry) => entry.key === key)
    if (!item) return
    const activeProductId = createdProduct?.id ?? (isEdit ? numericId : null)
    if (activeProductId && item.id) {
      setRemoveTarget(item)
      return
    }
    releasePreview(item)
    uploadedIdsRef.current.delete(key)
    setItems((current) => current.filter((entry) => entry.key !== key))
  }

  const confirmRemoveImage = async () => {
    const productId = createdProduct?.id ?? numericId
    if (!removeTarget?.id) return
    if (!acquireGalleryLock()) return
    const removedId = removeTarget.id
    const removedKey = removeTarget.key
    try {
      await deleteImage.mutateAsync({ productId, imageId: removedId })
      releasePreview(removeTarget)
      uploadedIdsRef.current.delete(removedKey)
      serverOrderRef.current = serverOrderRef.current.filter((id) => id !== removedId)
      setItems((current) => current.filter((entry) => entry.key !== removedKey))
      setRemoveTarget(null)
      deleteImage.reset()
      if (detail.data) void detail.refetch()
      invalidateCatalog()
    } catch {
      // The modal renders the mutation error.
    } finally {
      releaseGalleryLock()
    }
  }

  /** Order-only retry: uses the ids already accepted by the server. */
  const retryOrder = () => {
    const id = createdProduct?.id ?? (isEdit ? numericId : null)
    if (!id) return
    if (!acquireGalleryLock()) return
    const flowToken = flowTokenRef.current
    void (async () => {
      setUploading(true)
      try {
        const orderSaved = await persistOrderIds(id, knownIds(items))
        if (orderSaved) {
          invalidateCatalog()
          if (detail.data) void detail.refetch()
          // Only the flow that started this retry may report completion.
          if (createdProduct && isCurrentFlow(flowToken)) {
            navigate(`/admin/products/${createdProduct.id}/edit`, { replace: true, state: { created: true } })
          }
        }
      } finally {
        setUploading(false)
        releaseGalleryLock()
      }
    })()
  }

  /** Canonical amount of the current price draft, or null when it is unusable. */
  const priceAmount = (): number | null => {
    if (price.value === '') return null
    const amount = Number(price.value)
    return Number.isFinite(amount) && amount >= 0 ? amount : null
  }

  const fields = definitionFields ?? []
  /**
   * Whether the definitions belong to the currently selected category.
   *
   * While another category's definitions are still loading, `fields` is empty and
   * *every* stored code would look orphaned. No orphan set — and therefore no
   * confirmation — is derived from definitions that do not describe the target
   * category yet.
   */
  const definitionsReady = form.categoryId !== ''
    && definitions.data?.category_id === Number(form.categoryId)
  /** Codes the selected category renders a control for. */
  const editableCodes = new Set(fields.map((field) => field.code))
  /**
   * Server-confirmed codes the selected category cannot reuse as-is: it either
   * does not define them or declares another data type for the same code. A code
   * the administrator already typed a replacement into no longer needs a decision,
   * but only a code the category renders can be typed into at all — a stored value
   * without a control keeps requiring an explicit confirmation.
   */
  const blockedCodes = isEdit && definitionsReady
    ? orphanCodes(storedCharacteristics, fields).filter(
      (code) => !editableCodes.has(code) || isDraftEmpty(form.characteristics[code]),
    )
    : []
  /** Identity of the one transition a removal confirmation is valid for. */
  const removalConfirmationKey = `${form.categoryId}:${[...blockedCodes].sort().join(',')}`
  const confirmOrphanRemoval = blockedCodes.length > 0
    && removalConfirmation === removalConfirmationKey

  // Definitions arrive asynchronously, and a category change replaces them. A
  // code the target category shares with the product *with the same data type*
  // keeps showing the stored value instead of being silently treated as cleared.
  // A code whose data type changed is never reinterpreted into the new type: the
  // administrator either submits a valid replacement or confirms the removal.
  // oxlint-disable react/set-state-in-effect
  useEffect(() => {
    if (!isEdit || !definitionFields?.length) return
    setForm((current) => {
      let changed = false
      const characteristics = { ...current.characteristics }
      for (const field of definitionFields) {
        if (characteristics[field.code] !== undefined) continue
        const stored = storedCharacteristics[field.code]
        if (stored === undefined) continue
        if (stored.dataType !== field.data_type) continue
        characteristics[field.code] = draftFromValue(field.data_type, stored.value)
        changed = true
      }
      return changed ? { ...current, characteristics } : current
    })
  }, [definitionFields, isEdit, storedCharacteristics])
  // oxlint-enable react/set-state-in-effect

  /**
   * The three characteristic states of this submit: values to send, stored codes
   * the administrator cleared, and validation problems. Codes of the previous
   * category are only dropped when the administrator confirmed *this* transition.
   */
  const characteristicDrafts = () => buildCharacteristicPayload(
    fields,
    form.characteristics,
    storedValueMap(storedCharacteristics),
    { removeCodes: confirmOrphanRemoval ? blockedCodes : [] },
  )

  const validation = (): boolean => {
    if (categoryId > 0 && definitions.isError) {
      setSpecsError(adminErrorText(definitions.error))
      return false
    }
    const errors: Record<string, string> = {}
    if (form.name.trim().length < 2) errors.name = t('admin.form.validation_name')
    if (!priceText.trim()) errors.price = t('admin.form.validation_price')
    else if (priceAmount() === null) {
      // Excess precision is reported separately: the amount is well formed but
      // cannot be stored exactly, and it is never rounded behind the user's back.
      errors.price = t(priceInputIssue(priceText, locale) === 'precision'
        ? 'admin.form.validation_price_precision'
        : 'admin.form.validation_price_format')
    }
    const stock = Number(form.stock)
    if (!form.stock.trim() || !Number.isSafeInteger(stock) || stock < 0) errors.stock = t('admin.form.validation_stock')
    if (!form.categoryId) errors.categoryId = t('admin.form.validation_category')
    if (!form.productTypeId) errors.productTypeId = t('admin.form.validation_type')
    if (!form.manufacturerId) errors.manufacturerId = t('admin.form.validation_manufacturer')
    setFieldErrors(errors)

    // Per-field feedback: a required value must be present and every value must
    // match its declared data type before anything is sent to the server.
    const draft = characteristicDrafts()
    const draftErrors: Record<string, string> = {}
    for (const [code, issue] of Object.entries(draft.issues)) {
      draftErrors[code] = issue === 'number'
        ? t('admin.form.char_number_error')
        : t('admin.form.char_too_long_error')
    }
    setCharacteristicErrors(draftErrors)
    setSpecsError(draft.missing.length > 0
      ? t('admin.form.specs_incomplete', {
        fields: draft.missing.map((name) => translateCharacteristicLabel(name, locale)).join(', '),
      })
      : null)
    return Object.keys(errors).length === 0
      && draft.missing.length === 0
      && Object.keys(draftErrors).length === 0
  }

  const payload = (amount: number): AdminProductCreate => ({
    name: form.name.trim(),
    product_type_id: Number(form.productTypeId),
    manufacturer_id: Number(form.manufacturerId),
    price: amount.toFixed(2),
    stock_quantity: Number(form.stock),
    description: form.description,
    color: form.color || null,
    characteristics: characteristicDrafts().values as CharacteristicValueIn[],
    is_active: form.isActive,
  })

  const handleSubmit = async () => {
    setServerError(null)
    setSaved(false)
    if (!validation()) return
    // Validation guarantees a canonical amount; an invalid draft is never sent as 0.
    const amount = priceAmount()
    if (amount === null) return
    if (createdProduct) {
      navigate(`/admin/products/${createdProduct.id}/edit`, { replace: true, state: { created: true } })
      return
    }

    if (isEdit) {
      // The same builder functions the validation step used: submitted values and
      // explicit removals are always disjoint, and a code is only removed after
      // the administrator cleared a value the product actually stores.
      const draft = characteristicDrafts()
      const data: AdminProductUpdate = {
        name: form.name.trim(),
        product_type_id: Number(form.productTypeId),
        manufacturer_id: Number(form.manufacturerId),
        price: amount.toFixed(2),
        stock_quantity: Number(form.stock),
        description: form.description,
        color: form.color || null,
        characteristics: draft.values as CharacteristicValueIn[],
        is_active: form.isActive,
      }
      if (draft.removals.length > 0) data.remove_characteristics = draft.removals
      try {
        const updated = await updateProduct.mutateAsync({ productId: numericId, data })
        invalidateCatalog()
        // The server is the source of truth for the saved state: re-align the
        // editor with it so a second save builds on the committed values (and a
        // value just deleted cannot be "deleted" a second time). The confirmation
        // belonged to the transition that is now committed, so the next one must
        // be confirmed again.
        setStoredCharacteristics(storedCharacteristicsOf(updated))
        setForm((current) => ({ ...current, characteristics: draftsFrom(updated) }))
        setRemovalConfirmation(null)
        if (detail.data) void detail.refetch()
        setSaved(true)
      } catch (error) {
        setServerError(adminErrorText(error))
      }
      return
    }

    if (!acquireGalleryLock()) return
    const flowToken = flowTokenRef.current
    try {
      const created = await createProduct.mutateAsync({ data: payload(amount) })
      // The product row is committed on the server: the catalog must refresh even
      // when the administrator has already left this page.
      invalidateCatalog()
      const active = isCurrentFlow(flowToken)
      if (active) {
        setCreatedProduct(created)
        setOrderFailed(false)
        setUploading(true)
      }
      let result = { accepted: 0, failures: 0, orderSaved: true }
      try {
        result = await uploadPending(created.id, items)
      } finally {
        if (active) setUploading(false)
      }
      // Accepted images are separate committed mutations, independent of ordering.
      if (result.accepted > 0) invalidateCatalog()
      // A continuation of a flow the administrator already left must not navigate
      // (the committed data is still refreshed above). Re-checked after the upload
      // because the page can be left while the images are still uploading.
      if (!isCurrentFlow(flowToken)) return
      setUploadFailures(result.failures)
      setOrderFailed(!result.orderSaved)
      if (result.failures === 0 && result.orderSaved) {
        navigate(`/admin/products/${created.id}/edit`, { replace: true, state: { created: true } })
      }
    } catch (error) {
      setServerError(adminErrorText(error))
    } finally {
      releaseGalleryLock()
    }
  }

  const tabs: readonly [AdminTab, AdminTab] = [
    { key: 'product', label: t('admin.form.tab_product'), icon: FiPackage, to: '' },
    { key: 'reviews', label: t('admin.form.tab_reviews'), icon: FiMessageCircle, to: '' },
  ]

  // Tab semantics only exist when the tab strip above is actually rendered.
  const panelProps: HTMLAttributes<HTMLDivElement> = isEdit
    ? { id: adminTabPanelId(TABS_ID, tab), role: 'tabpanel', 'aria-labelledby': adminTabId(TABS_ID, tab) }
    : {}

  if (isEdit && !validId) {
    return (
      <AdminLayout footer={false}>
        <section className={`${adminCard} p-6`}>
          <AdminError message={t('admin.form.not_found')} onRetry={() => navigate('/admin/products')} />
        </section>
      </AdminLayout>
    )
  }

  if (isEdit && detail.isError) {
    const status = detail.error instanceof ApiError ? detail.error.status : 0
    return (
      <AdminLayout footer={false}>
        <section className={`${adminCard} p-6`}>
          {status === 404 ? (
            <div role="alert" className="py-10 text-center">
              <p className="text-base font-medium text-text-primary">{t('admin.form.not_found')}</p>
              <button type="button" onClick={() => navigate('/admin/products')} className={`${adminSecondaryButton} mt-4`}>
                {t('admin.products.title')}
              </button>
            </div>
          ) : (
            <AdminError message={adminErrorText(detail.error)} onRetry={() => void detail.refetch()} />
          )}
        </section>
      </AdminLayout>
    )
  }

  if (loadedKey !== formKey || options.isLoading) {
    return (
      <AdminLayout footer={false}>
        <AdminProductFormSkeleton withTabs={isEdit} />
      </AdminLayout>
    )
  }

  if (options.isError) {
    return (
      <AdminLayout footer={false}>
        <section className={`${adminCard} p-6`}>
          <AdminError message={adminErrorText(options.error)} onRetry={() => void options.refetch()} />
        </section>
      </AdminLayout>
    )
  }

  const locked = createdProduct !== null || updateProduct.isPending || createProduct.isPending || uploading
  const categoryOptions = (options.data?.categories ?? []).map(({ category }) => ({
    value: String(category.id), label: category.name,
  }))
  const selectedGroup = (options.data?.categories ?? []).find((group) => String(group.category.id) === form.categoryId)
  const typeOptions = (selectedGroup?.product_types ?? []).map((type) => ({
    value: String(type.id), label: type.name,
  }))
  const manufacturerOptions = (options.data?.manufacturers ?? []).map((maker) => ({
    value: String(maker.id), label: maker.name,
  }))
  const colors = filterOptions.data?.colors ?? []
  const colorOptions = colors.includes(form.color) || !form.color ? colors : [form.color, ...colors]
  const templateFields = definitions.data?.fields ?? []
  const submitLabel = createdProduct
    ? t('admin.form.go_to_edit')
    : isEdit ? t('admin.form.submit_save') : t('admin.form.submit_create')
  const submitPending = createProduct.isPending || updateProduct.isPending || uploading || definitions.isLoading

  return (
    <AdminLayout footer={false}>
      <section className={`${adminCard} px-5 py-6 sm:px-8 sm:py-8`}>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {isEdit ? t('admin.form.edit_title') : t('admin.form.create_title')}
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          {isEdit ? t('admin.form.edit_subtitle') : t('admin.form.create_subtitle')}
        </p>

        {isEdit && (
          <div className="mt-6 border-b border-border">
            <AdminTabs
              tabs={tabs}
              activeKey={tab}
              label={t('admin.form.tab_product')}
              idPrefix={TABS_ID}
              onSelect={(next) => setSearchParams((current) => {
                const params = new URLSearchParams(current)
                if (next.key === 'reviews') params.set('tab', 'reviews')
                else params.delete('tab')
                return params
              }, { replace: true })}
            />
          </div>
        )}

        <div className="mt-6" {...panelProps}>
          {isEdit && tab === 'reviews' ? (
            <ProductReviewsPanel productId={numericId} />
          ) : (
          <form
            className="mt-6 space-y-8"
            noValidate
            onSubmit={(event) => { event.preventDefault(); void handleSubmit() }}
          >
            {(flashCreated || saved) && (
              <AdminAlert tone="success" message={saved ? t('admin.form.saved') : t('admin.form.created')} />
            )}

            {createdProduct && uploadFailures > 0 && (
              <div role="alert" className="rounded-lg border border-danger-border bg-danger-surface px-4 py-3 text-sm text-text-primary">
                <p className="font-medium text-danger">
                  {t('admin.form.created_images_failed', { count: uploadFailures })}
                </p>
                <p className="mt-1 text-text-secondary">{t('admin.form.created_images_failed_hint')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={retryUploads}
                    className={adminSecondaryButton}
                  >
                    {t('admin.form.retry_upload')}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/products/${createdProduct.id}/edit`, { replace: true, state: { created: true } })}
                    className={adminPrimaryButton}
                  >
                    {t('admin.form.go_to_edit')}
                  </button>
                </div>
              </div>
            )}

            {uploadFailures === 0 && orderFailed && (
              <div role="alert" className="rounded-lg border border-danger-border bg-danger-surface px-4 py-3 text-sm text-text-primary">
                <p className="font-medium text-danger">
                  {createdProduct ? t('admin.form.order_failed_title') : t('admin.form.order_failed_title_edit')}
                </p>
                <p className="mt-1 text-text-secondary">{t('admin.form.order_failed_hint')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={uploading} onClick={retryOrder} className={adminSecondaryButton}>
                    {t('admin.form.retry_order')}
                  </button>
                  {createdProduct && (
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/products/${createdProduct.id}/edit`, { replace: true, state: { created: true } })}
                      className={adminPrimaryButton}
                    >
                      {t('admin.form.go_to_edit')}
                    </button>
                  )}
                </div>
              </div>
            )}

            <section>
              <h2 className="border-b border-border pb-3 text-lg font-semibold text-text-primary">
                {t('admin.form.section_main')}
              </h2>
              <div className="mt-4 space-y-4">
                {isEdit ? (
                  <FloatingControl id="product-name" label={`${t('admin.form.name')} *`} disabled={locked}>
                    <input
                      id="product-name"
                      value={form.name}
                      maxLength={255}
                      required
                      disabled={locked}
                      onChange={(event) => changeField('name', event.target.value)}
                      className={floatingInputClass}
                    />
                  </FloatingControl>
                ) : (
                  <TextField
                    id="product-name"
                    label={t('admin.form.name')}
                    required
                    value={form.name}
                    maxLength={255}
                    placeholder={t('admin.form.name_placeholder')}
                    disabled={locked}
                    error={fieldErrors.name}
                    onChange={(event) => changeField('name', event.target.value)}
                  />
                )}
                {isEdit && fieldErrors.name && <p className="text-xs text-danger" role="alert">{fieldErrors.name}</p>}

                <div className="grid gap-4 sm:grid-cols-3">
                  {isEdit ? (
                    <>
                      <div>
                        <FloatingControl id="product-price" label={`${t('admin.form.price')} *`} disabled={locked}>
                          <input
                            id="product-price" type="text" inputMode="decimal" placeholder={pricePlaceholder}
                            value={priceText} disabled={locked} aria-required
                            onChange={(event) => changePrice(event.target.value)}
                            className={floatingInputClass}
                          />
                        </FloatingControl>
                        {fieldErrors.price && <p className="mt-1 text-xs text-danger" role="alert">{fieldErrors.price}</p>}
                      </div>
                      <div>
                        <FloatingControl id="product-stock" label={`${t('admin.form.stock')} *`} disabled={locked}>
                          <input
                            id="product-stock" type="number" min="0" step="1" inputMode="numeric"
                            value={form.stock} disabled={locked} aria-required
                            onChange={(event) => changeField('stock', event.target.value)}
                            className={floatingInputClass}
                          />
                        </FloatingControl>
                        {fieldErrors.stock && <p className="mt-1 text-xs text-danger" role="alert">{fieldErrors.stock}</p>}
                      </div>
                      <FloatingControl id="product-status" label={t('admin.form.status')} disabled={locked}>
                        <select
                          id="product-status"
                          value={form.isActive ? 'active' : 'inactive'}
                          disabled={locked}
                          onChange={(event) => changeField('isActive', event.target.value === 'active')}
                          className={floatingInputClass}
                        >
                          <option value="active">{t('admin.status.active')}</option>
                          <option value="inactive">{t('admin.status.inactive')}</option>
                        </select>
                      </FloatingControl>
                    </>
                  ) : (
                    <>
                      <TextField
                        id="product-price" label={t('admin.form.price')} required type="text" inputMode="decimal"
                        placeholder={pricePlaceholder} value={priceText} disabled={locked}
                        error={fieldErrors.price}
                        onChange={(event) => changePrice(event.target.value)}
                      />
                      <TextField
                        id="product-stock" label={t('admin.form.stock')} required type="number"
                        min="0" step="1" inputMode="numeric" value={form.stock} disabled={locked}
                        hint={t('admin.form.stock_hint')} error={fieldErrors.stock}
                        onChange={(event) => changeField('stock', event.target.value)}
                      />
                      <SelectField
                        id="product-status" label={t('admin.form.status')}
                        value={form.isActive ? 'active' : 'inactive'} disabled={locked}
                        onChange={(event) => changeField('isActive', event.target.value === 'active')}
                        options={[
                          { value: 'active', label: t('admin.status.active') },
                          { value: 'inactive', label: t('admin.status.inactive') },
                        ]}
                      />
                    </>
                  )}
                </div>
              </div>
            </section>

            <section className="border-t border-border pt-6">
              <h2 className="text-lg font-semibold text-text-primary">{t('admin.form.gallery')}</h2>
              <div className="mt-3">
                <ProductGalleryEditor
                  items={items}
                  disabled={locked || uploading || reorderImages.isPending || deleteImage.isPending}
                  onAddFiles={handleAddFiles}
                  onRemove={removeItem}
                  onReorder={reorder}
                  onRetry={createdProduct ? retryItem : isEdit ? retryItem : undefined}
                  error={galleryError}
                  errorHint={orderFailed ? t('admin.form.order_failed_hint') : null}
                />
              </div>
            </section>

            <section className="border-t border-border pt-6">
              <h2 className="text-lg font-semibold text-text-primary">
                {t('admin.form.section_description')}
              </h2>
              <div className="mt-4">
                {isEdit ? (
                  <FloatingControl id="product-description" label={t('admin.form.description')} disabled={locked}>
                    <textarea
                      id="product-description"
                      value={form.description}
                      rows={2}
                      maxLength={20000}
                      disabled={locked}
                      onChange={(event) => changeField('description', event.target.value)}
                      className={`${floatingInputClass} min-h-[46px] resize-y py-1`}
                    />
                  </FloatingControl>
                ) : (
                  <TextareaField
                    id="product-description"
                    label={t('admin.form.description')}
                    value={form.description}
                    rows={4}
                    maxLength={20000}
                    placeholder={t('admin.form.description_placeholder')}
                    disabled={locked}
                    onChange={(event) => changeField('description', event.target.value)}
                  />
                )}
              </div>
            </section>

            <section className="border-t border-border pt-6">
              <h2 className="text-lg font-semibold text-text-primary">
                {t('admin.form.section_classification')}
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <SelectField
                  id="product-category" label={t('admin.form.category')} required
                  value={form.categoryId} disabled={locked}
                  placeholder={t('admin.form.category_placeholder')}
                  options={categoryOptions} error={fieldErrors.categoryId}
                  onChange={(event) => changeCategory(event.target.value)}
                />
                <SelectField
                  id="product-type" label={t('admin.form.product_type')} required
                  value={form.productTypeId} disabled={locked || !form.categoryId}
                  placeholder={form.categoryId ? t('admin.form.product_type_select') : t('admin.form.product_type_placeholder')}
                  options={typeOptions} error={fieldErrors.productTypeId}
                  onChange={(event) => changeProductType(event.target.value)}
                />
                <SelectField
                  id="product-manufacturer" label={t('admin.form.manufacturer')} required
                  value={form.manufacturerId} disabled={locked}
                  placeholder={t('admin.form.manufacturer_placeholder')}
                  options={manufacturerOptions} error={fieldErrors.manufacturerId}
                  onChange={(event) => changeField('manufacturerId', event.target.value)}
                />
                <SelectField
                  id="product-color" label={t('admin.form.color')}
                  value={form.color} disabled={locked}
                  placeholder={t('admin.form.color_placeholder')}
                  options={colorOptions.map((color) => ({ value: color, label: color }))}
                  onChange={(event) => changeField('color', event.target.value)}
                />
              </div>
            </section>

            <section className="border-t border-border pt-6">
              <h2 className="text-lg font-semibold text-text-primary">{t('admin.form.section_specs')}</h2>
              <p className="mt-1 text-sm text-text-secondary">{t('admin.form.specs_hint')}</p>
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setSpecsOpen((open) => !open)}
                  aria-expanded={specsOpen}
                  className="flex w-full items-center justify-between gap-3 bg-surface-2 px-4 py-3 text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <FiSliders className="h-4 w-4 text-primary" aria-hidden="true" />
                    {t('admin.form.specs_panel')}
                  </span>
                  {specsOpen
                    ? <FiChevronUp className="h-4 w-4 text-text-muted" aria-hidden="true" />
                    : <FiChevronDown className="h-4 w-4 text-text-muted" aria-hidden="true" />}
                </button>

                {specsOpen && (
                  <div className="space-y-4 border-t border-border bg-surface p-4">
                    {!form.categoryId ? (
                      <p className="text-xs text-text-muted">{t('admin.form.specs_empty')}</p>
                    ) : definitions.isLoading ? (
                      <SkeletonRegion className="space-y-3" testId="spec-template-skeleton">
                        {[0, 1, 2].map((index) => (
                          <div key={index} className="grid items-center gap-3 sm:grid-cols-2">
                            <Skeleton className="h-11 w-full rounded-lg" />
                            <Skeleton className="h-11 w-full rounded-lg" />
                          </div>
                        ))}
                      </SkeletonRegion>
                    ) : definitions.isError ? (
                      <AdminError message={adminErrorText(definitions.error)} onRetry={() => void definitions.refetch()} compact />
                    ) : templateFields.length === 0 ? (
                      <p className="text-sm text-text-muted">{t('admin.form.specs_empty')}</p>
                    ) : (
                      templateFields.map((field) => (
                        <CharacteristicFieldEditor
                          key={field.code}
                          field={field}
                          draft={form.characteristics[field.code] ?? emptyDraft(field.data_type)}
                          disabled={locked}
                          error={characteristicErrors[field.code]}
                          onChange={(patch) => changeDraft(field.code, field.data_type, patch)}
                        />
                      ))
                    )}
                    {blockedCodes.length > 0 && (
                      <div role="alert" className="rounded-lg border border-danger-border bg-danger-surface px-4 py-3 text-sm text-text-primary">
                        <p className="font-medium text-danger">
                          {t('admin.form.char_orphans_title', { count: blockedCodes.length })}
                        </p>
                        <p className="mt-1 text-xs text-text-secondary">{blockedCodes.join(', ')}</p>
                        <label className="mt-3 flex items-start gap-2 text-xs text-text-primary">
                          <input
                            type="checkbox"
                            checked={confirmOrphanRemoval}
                            disabled={locked}
                            onChange={(event) => setRemovalConfirmation(
                              event.target.checked ? removalConfirmationKey : null,
                            )}
                            className="mt-0.5"
                          />
                          <span>{t('admin.form.char_orphans_confirm')}</span>
                        </label>
                      </div>
                    )}
                    {specsError && <p role="alert" className="text-sm text-danger">{specsError}</p>}
                  </div>
                )}
              </div>
            </section>

            {serverError && <AdminAlert message={serverError} />}

            <div className="border-t border-border pt-6">
              <button
                type="submit"
                disabled={submitPending}
                className={`${adminPrimaryButton} w-full`}
              >
                {submitPending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                ) : isEdit ? (
                  <FiSave className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <FiPlus className="h-5 w-5" aria-hidden="true" />
                )}
                {submitPending
                  ? t('admin.common.saving')
                  : submitLabel}
              </button>
              {createdProduct && (
                <p className="mt-2 text-center text-xs text-text-muted">
                  {formatMoney(createdProduct.price)} · {t('admin.form.created')}
                </p>
              )}
            </div>
          </form>
          )}
        </div>
      </section>

      <DeleteConfirmationModal
        open={removeTarget !== null}
        title={t('admin.form.gallery_remove_title')}
        description={t('admin.form.gallery_remove_desc')}
        warning={t('admin.form.gallery_remove_warning')}
        note={t('admin.form.gallery_remove_note')}
        confirmLabel={t('admin.form.gallery_remove_confirm')}
        pending={deleteImage.isPending}
        error={deleteImage.isError ? adminErrorText(deleteImage.error) : null}
        onCancel={() => { if (!deleteImage.isPending) { setRemoveTarget(null); deleteImage.reset() } }}
        onConfirm={() => void confirmRemoveImage()}
      />
    </AdminLayout>
  )
}

/**
 * One dynamically generated characteristic input.
 *
 * The control follows the definition's declared data type: free text, validated
 * numeric, checkbox, editable string list or editable number list. List rows are
 * edited individually so order and duplicates are never lost to comma splitting.
 */
function CharacteristicFieldEditor({
  field, draft, disabled, error, onChange,
}: {
  field: CharacteristicDefinitionLike
  draft: CharacteristicDraft
  disabled: boolean
  error?: string
  onChange: (patch: Partial<CharacteristicDraft>) => void
}) {
  const { t, i18n } = useTranslation()
  const controlId = `characteristic-${field.code}`
  const kind = fieldTypeOf(field.data_type)
  const language = i18n.resolvedLanguage ?? 'ru'
  // The stored definition label/unit are Russian; the English editor shows the
  // same dictionary the storefront uses, keyed by the stable `code`.
  const name = characteristicLabel(field, language)
  const unitText = translateCharacteristicUnit(field.unit, language)
  const unit = unitText ? <span className="ml-1 whitespace-nowrap text-text-muted">{unitText}</span> : null
  const label = (
    <label htmlFor={controlId} className="flex min-w-0 items-center text-sm text-text-primary">
      <span className="truncate">{name}</span>
      {unit}
      {field.is_required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
    </label>
  )

  const setRow = (index: number, value: string) => {
    const items = [...draft.items]
    items[index] = value
    onChange({ items })
  }

  return (
    <div className="grid items-start gap-3 sm:grid-cols-2">
      <div className="flex min-h-11 items-center rounded-lg border border-border bg-surface-2 px-3.5 text-sm text-text-primary">
        {label}
      </div>
      <div className="min-w-0">
        {kind === 'boolean' ? (
          // Three states, because "never set", "true" and "false" are different
          // facts: an unchecked box would silently turn "absent" into `false`.
          <select
            id={controlId}
            value={draft.checked === null || draft.checked === undefined ? '' : draft.checked ? 'true' : 'false'}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            onChange={(event) => onChange({
              checked: event.target.value === '' ? null : event.target.value === 'true',
            })}
            className={adminControl}
          >
            <option value="">{t('admin.form.char_boolean_unset')}</option>
            <option value="true">{t('admin.form.char_boolean_true')}</option>
            <option value="false">{t('admin.form.char_boolean_false')}</option>
          </select>
        ) : kind === 'string' || kind === 'number' ? (
          <input
            id={controlId}
            type="text"
            inputMode={kind === 'number' ? 'decimal' : undefined}
            aria-label={name}
            aria-invalid={Boolean(error)}
            value={draft.text}
            disabled={disabled}
            maxLength={kind === 'string' ? MAX_TEXT_LENGTH : undefined}
            placeholder={kind === 'number' ? t('admin.form.char_number_placeholder') : undefined}
            onChange={(event) => onChange({ text: event.target.value })}
            className={adminControl}
          />
        ) : (
          <div className="space-y-2">
            {draft.items.length === 0 && (
              <p className="text-xs text-text-muted">{t('admin.form.char_list_empty')}</p>
            )}
            {draft.items.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  aria-label={`${name} ${index + 1}`}
                  inputMode={kind === 'number_list' ? 'decimal' : undefined}
                  value={row}
                  disabled={disabled}
                  maxLength={kind === 'string_list' ? MAX_TEXT_LENGTH : undefined}
                  onChange={(event) => setRow(index, event.target.value)}
                  className={adminControl}
                />
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t('admin.form.char_list_remove', { index: index + 1 })}
                  onClick={() => onChange({ items: draft.items.filter((_, position) => position !== index) })}
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-sm text-text-primary hover:bg-surface-3"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={disabled || draft.items.length >= MAX_LIST_ROWS}
              onClick={() => onChange({ items: [...draft.items, ''] })}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-3 disabled:opacity-50"
            >
              {t('admin.form.char_list_add')}
            </button>
          </div>
        )}
        {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    </div>
  )
}
