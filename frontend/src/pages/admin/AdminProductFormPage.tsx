import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { FiChevronDown, FiChevronUp, FiMessageCircle, FiPackage, FiPlus, FiSave, FiSliders } from 'react-icons/fi'
import {
  useCreateProductApiV1AdminProductsPost,
  useDeleteImageApiV1AdminProductsProductIdImagesImageIdDelete,
  useGetFilterOptionsApiV1ProductsFiltersGet,
  useGetProductApiV1AdminProductsProductIdGet,
  useGetProductOptionsApiV1AdminProductOptionsGet,
  useGetSpecTemplateApiV1AdminProductTypesProductTypeIdSpecFieldsGet,
  useReorderImagesApiV1AdminProductsProductIdImagesOrderPut,
  useUpdateProductApiV1AdminProductsProductIdPatch,
  useUploadImageApiV1AdminProductsProductIdImagesPost,
} from '../../api/generated/client'
import type { AdminProductCreate, AdminProductDetailOut, AdminProductUpdate } from '../../api/generated/model'
import { ApiError } from '../../api/transport'
import { adminErrorText, formatMoney } from '../../admin/params'
import i18n from '../../i18n'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { AdminTabs, type AdminTab } from '../../components/admin/AdminTabs'
import { AdminAlert, AdminError, AdminLoading } from '../../components/admin/AdminFeedback'
import { DeleteConfirmationModal } from '../../components/admin/DeleteConfirmationModal'
import { ProductGalleryEditor, type GalleryItem } from '../../components/admin/ProductGalleryEditor'
import { ProductReviewsPanel } from '../../components/admin/ProductReviewsPanel'
import {
  FloatingControl, SelectField, TextField, TextareaField, floatingInputClass,
} from '../../components/admin/AdminFields'
import { BackButton } from '../../components/BackButton'
import {
  adminCard, adminControl, adminPrimaryButton, adminSecondaryButton,
} from '../../components/admin/adminStyles'

const MAX_IMAGES = 10
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface ProductFormState {
  name: string
  price: string
  stock: string
  isActive: boolean
  description: string
  categoryId: string
  productTypeId: string
  manufacturerId: string
  color: string
  specs: Record<string, string>
}

const EMPTY_FORM: ProductFormState = {
  name: '', price: '', stock: '0', isActive: true, description: '',
  categoryId: '', productTypeId: '', manufacturerId: '', color: '', specs: {},
}

let galleryKey = 0
const nextGalleryKey = () => `gallery-${++galleryKey}`

function formatPriceInput(value: string): string {
  const parsed = Number(value)
  const locale = i18n.resolvedLanguage === 'en' ? 'en-GB' : 'ru-RU'
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(parsed)
    : value
}

function parsePriceInput(value: string): number {
  const cleaned = value.replace(/\s/g, '')
  if (i18n.resolvedLanguage === 'en') return Number(cleaned.replace(/,/g, ''))
  return Number(cleaned.replace(',', '.'))
}

function formFromProduct(product: AdminProductDetailOut): ProductFormState {
  return {
    name: product.name,
    price: formatPriceInput(product.price),
    stock: String(product.stock_quantity),
    isActive: product.is_active,
    description: product.description,
    categoryId: String(product.category.id),
    productTypeId: String(product.product_type.id),
    manufacturerId: String(product.manufacturer.id),
    color: product.color ?? '',
    specs: { ...product.specifications },
  }
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
  const [items, setItems] = useState<GalleryItem[]>([])
  const formKey = isEdit ? `edit-${numericId}` : 'create'
  const [loadedKey, setLoadedKey] = useState<string | null>(isEdit ? null : 'create')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [specsError, setSpecsError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [galleryError, setGalleryError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [specsOpen, setSpecsOpen] = useState(true)

  const [createdProduct, setCreatedProduct] = useState<AdminProductDetailOut | null>(null)
  const [uploadFailures, setUploadFailures] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<GalleryItem | null>(null)

  const uploadedIdsRef = useRef<Map<string, number>>(new Map())
  const previewUrlsRef = useRef<Set<string>>(new Set())

  const typeId = form.productTypeId ? Number(form.productTypeId) : 0
  const template = useGetSpecTemplateApiV1AdminProductTypesProductTypeIdSpecFieldsGet(typeId, {
    query: { enabled: typeId > 0, retry: false },
  })

  const createProduct = useCreateProductApiV1AdminProductsPost()
  const updateProduct = useUpdateProductApiV1AdminProductsProductIdPatch()
  const uploadImage = useUploadImageApiV1AdminProductsProductIdImagesPost()
  const reorderImages = useReorderImagesApiV1AdminProductsProductIdImagesOrderPut()
  const deleteImage = useDeleteImageApiV1AdminProductsProductIdImagesImageIdDelete()

  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrlsRef.current.clear()
  }, [])

  // The product detail is external server state: hydrate the editable draft once
  // per route. `loadedKey` guards later detail refetches so unsaved edits survive.
  // oxlint-disable react/set-state-in-effect
  useEffect(() => {
    if (loadedKey === formKey) return
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrlsRef.current.clear()
    uploadedIdsRef.current.clear()
    setCreatedProduct(null)
    setUploadFailures(0)
    setUploading(false)
    setFieldErrors({})
    setSpecsError(null)
    setServerError(null)
    setGalleryError(null)
    setSaved(false)
    setRemoveTarget(null)
    if (!isEdit) {
      setForm(EMPTY_FORM)
      setItems([])
      setLoadedKey(formKey)
      return
    }
    const data = detail.data
    if (!data) return
    const images = data.images ?? []
    setForm(formFromProduct(data))
    setItems(images.map((image) => ({
      key: `image-${image.id}`,
      id: image.id,
      url: image.url,
      altText: image.alt_text,
    })))
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
    setForm((current) => ({ ...current, categoryId: value, productTypeId: '', specs: {} }))
    setFieldErrors((current) => ({ ...current, categoryId: '' }))
    setSpecsError(null)
    setSaved(false)
  }

  const changeProductType = (value: string) => {
    setForm((current) => ({ ...current, productTypeId: value, specs: {} }))
    setFieldErrors((current) => ({ ...current, productTypeId: '' }))
    setSpecsError(null)
    setSaved(false)
  }

  const invalidateCatalog = () => {
    void queryClient.invalidateQueries({ queryKey: ['/api/v1/admin/products'] })
    void queryClient.invalidateQueries({ queryKey: ['/api/v1/admin/stats'] })
    void queryClient.invalidateQueries({ queryKey: ['/api/v1/products'] })
  }

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

  /** Uploads every not-yet-uploaded item of `source` and keeps the cover order. */
  const uploadPending = async (id: number, source: GalleryItem[]): Promise<number> => {
    let failures = 0
    for (const item of source) {
      if (!item.file || item.id || uploadedIdsRef.current.has(item.key)) continue
      markItem(item.key, { uploading: true, failed: false })
      try {
        const image = await uploadImage.mutateAsync({ productId: id, data: { file: item.file } })
        uploadedIdsRef.current.set(item.key, image.id)
        markItem(item.key, { uploading: false, failed: false, id: image.id, url: image.url })
      } catch (error) {
        failures += 1
        markItem(item.key, { uploading: false, failed: true })
        setGalleryError(adminErrorText(error))
      }
    }
    const orderedIds = source
      .map((item) => uploadedIdsRef.current.get(item.key))
      .filter((value): value is number => typeof value === 'number')
    if (orderedIds.length > 1) {
      try {
        await reorderImages.mutateAsync({ productId: id, data: { image_ids: orderedIds } })
      } catch {
        // The product and uploads stay valid; order can be corrected by dragging.
      }
    }
    return failures
  }

  const handleAddFiles = (files: File[]) => {
    const accepted = validateFiles(files)
    if (!accepted) return
    const newItems: GalleryItem[] = accepted.map((file) => ({
      key: nextGalleryKey(),
      file,
      previewUrl: URL.createObjectURL(file),
      uploading: isEdit && createdProduct === null,
    }))
    trackPreviews(newItems)
    if (!isEdit || createdProduct) return

    // Edit mode: the product exists, so images upload immediately.
    void (async () => {
      setUploading(true)
      let failures = 0
      for (const item of newItems) {
        try {
          const image = await uploadImage.mutateAsync({ productId: numericId, data: { file: item.file as File } })
          uploadedIdsRef.current.set(item.key, image.id)
          markItem(item.key, { uploading: false, failed: false, id: image.id, url: image.url })
        } catch (error) {
          failures += 1
          markItem(item.key, { uploading: false, failed: true })
          setGalleryError(adminErrorText(error))
        }
      }
      setUploading(false)
      if (failures === 0 && detail.data) void detail.refetch()
    })()
  }

  const retryItem = (key: string) => {
    const item = items.find((entry) => entry.key === key)
    if (!item?.file) return
    const id = createdProduct?.id ?? (isEdit ? numericId : null)
    if (!id) return
    void (async () => {
      markItem(key, { uploading: true, failed: false })
      try {
        const image = await uploadImage.mutateAsync({ productId: id, data: { file: item.file as File } })
        uploadedIdsRef.current.set(key, image.id)
        markItem(key, { uploading: false, failed: false, id: image.id, url: image.url })
        const orderedIds = items
          .map((entry) => (entry.key === key ? image.id : uploadedIdsRef.current.get(entry.key)))
          .filter((value): value is number => typeof value === 'number')
        if (orderedIds.length > 1) {
          await reorderImages.mutateAsync({ productId: id, data: { image_ids: orderedIds } })
        }
        setUploadFailures((current) => Math.max(0, current - 1))
      } catch (error) {
        markItem(key, { uploading: false, failed: true })
        setGalleryError(adminErrorText(error))
      }
    })()
  }

  const reorder = (fromIndex: number, toIndex: number) => {
    const next = [...items]
    const [moved] = next.splice(fromIndex, 1)
    if (!moved) return
    next.splice(toIndex, 0, moved)
    setItems(next)
    const allUploaded = next.every((item) => typeof item.id === 'number')
    if (isEdit && !createdProduct && allUploaded) {
      const previous = items
      void reorderImages
        .mutateAsync({ productId: numericId, data: { image_ids: next.map((item) => item.id as number) } })
        .then(() => { if (detail.data) void detail.refetch() })
        .catch((error) => {
          setGalleryError(adminErrorText(error))
          setItems(previous)
        })
    }
  }

  const removeItem = (key: string) => {
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
    try {
      await deleteImage.mutateAsync({ productId, imageId: removeTarget.id })
      releasePreview(removeTarget)
      uploadedIdsRef.current.delete(removeTarget.key)
      setItems((current) => current.filter((entry) => entry.key !== removeTarget.key))
      setRemoveTarget(null)
      deleteImage.reset()
      if (detail.data) void detail.refetch()
      invalidateCatalog()
    } catch {
      // The modal renders the mutation error.
    }
  }

  const validation = (): boolean => {
    if (typeId > 0 && template.isError) {
      setSpecsError(adminErrorText(template.error))
      return false
    }
    const errors: Record<string, string> = {}
    if (form.name.trim().length < 2) errors.name = t('admin.form.validation_name')
    const price = parsePriceInput(form.price)
    if (!form.price.trim() || !Number.isFinite(price) || price < 0) errors.price = t('admin.form.validation_price')
    const stock = Number(form.stock)
    if (!form.stock.trim() || !Number.isSafeInteger(stock) || stock < 0) errors.stock = t('admin.form.validation_stock')
    if (!form.categoryId) errors.categoryId = t('admin.form.validation_category')
    if (!form.productTypeId) errors.productTypeId = t('admin.form.validation_type')
    if (!form.manufacturerId) errors.manufacturerId = t('admin.form.validation_manufacturer')
    setFieldErrors(errors)

    const missing = (template.data?.fields ?? [])
      .filter((field) => field.is_required && !(form.specs[field.code] ?? '').trim())
      .map((field) => field.label)
    setSpecsError(missing.length > 0 ? t('admin.form.specs_incomplete', { fields: missing.join(', ') }) : null)
    return Object.keys(errors).length === 0 && missing.length === 0
  }

  const payload = (): AdminProductCreate => ({
    name: form.name.trim(),
    product_type_id: Number(form.productTypeId),
    manufacturer_id: Number(form.manufacturerId),
    price: (parsePriceInput(form.price) || 0).toFixed(2),
    stock_quantity: Number(form.stock),
    description: form.description,
    color: form.color || null,
    specifications: form.specs,
    is_active: form.isActive,
  })

  const handleSubmit = async () => {
    setServerError(null)
    setSaved(false)
    if (!validation()) return
    if (createdProduct) {
      navigate(`/admin/products/${createdProduct.id}/edit`, { replace: true, state: { created: true } })
      return
    }

    if (isEdit) {
      const data: AdminProductUpdate = {
        name: form.name.trim(),
        product_type_id: Number(form.productTypeId),
        manufacturer_id: Number(form.manufacturerId),
        price: (parsePriceInput(form.price) || 0).toFixed(2),
        stock_quantity: Number(form.stock),
        description: form.description,
        color: form.color || null,
        specifications: form.specs,
        is_active: form.isActive,
      }
      try {
        await updateProduct.mutateAsync({ productId: numericId, data })
        invalidateCatalog()
        if (detail.data) void detail.refetch()
        setSaved(true)
      } catch (error) {
        setServerError(adminErrorText(error))
      }
      return
    }

    try {
      const created = await createProduct.mutateAsync({ data: payload() })
      setCreatedProduct(created)
      invalidateCatalog()
      setUploading(true)
      let failures = 0
      try {
        failures = await uploadPending(created.id, items)
      } finally {
        setUploading(false)
      }
      setUploadFailures(failures)
      if (failures === 0) {
        navigate(`/admin/products/${created.id}/edit`, { replace: true, state: { created: true } })
      }
    } catch (error) {
      setServerError(adminErrorText(error))
    }
  }

  const tabs: readonly [AdminTab, AdminTab] = [
    { key: 'product', label: t('admin.form.tab_product'), icon: FiPackage, to: '' },
    { key: 'reviews', label: t('admin.form.tab_reviews'), icon: FiMessageCircle, to: '' },
  ]

  const back = <div className="mb-3"><BackButton /></div>

  if (isEdit && !validId) {
    return (
      <AdminLayout footer={false}>
        {back}
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
        {back}
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
        {back}
        <section className={`${adminCard} p-6`}><AdminLoading /></section>
      </AdminLayout>
    )
  }

  if (options.isError) {
    return (
      <AdminLayout footer={false}>
        {back}
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
  const templateFields = template.data?.fields ?? []
  const submitLabel = createdProduct
    ? t('admin.form.go_to_edit')
    : isEdit ? t('admin.form.submit_save') : t('admin.form.submit_create')
  const submitPending = createProduct.isPending || updateProduct.isPending || uploading || template.isLoading

  return (
    <AdminLayout footer={false}>
      {back}
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
              onSelect={(next) => setSearchParams((current) => {
                const params = new URLSearchParams(current)
                if (next.key === 'reviews') params.set('tab', 'reviews')
                else params.delete('tab')
                return params
              }, { replace: true })}
            />
          </div>
        )}

        {isEdit && tab === 'reviews' ? (
          <div className="mt-6">
            <ProductReviewsPanel productId={numericId} />
          </div>
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
                    onClick={() => {
                      if (!createdProduct) return
                      setUploading(true)
                      void uploadPending(createdProduct.id, items)
                        .then((failures) => {
                          setUploadFailures(failures)
                          if (failures === 0) {
                            navigate(`/admin/products/${createdProduct.id}/edit`, { replace: true, state: { created: true } })
                          }
                        })
                        .finally(() => setUploading(false))
                    }}
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

            <section>
              <h2 className="border-b border-border pb-3 text-lg font-semibold text-text-primary">
                {t('admin.form.section_main')}
              </h2>
              <div className="mt-4 space-y-4">
                {isEdit ? (
                  <FloatingControl id="product-name" label={`${t('admin.form.name')} *`}>
                    <input
                      id="product-name"
                      value={form.name}
                      maxLength={255}
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
                        <FloatingControl id="product-price" label={`${t('admin.form.price')} *`}>
                          <input
                            id="product-price" type="text" inputMode="decimal" placeholder="0,00"
                            value={form.price} disabled={locked}
                            onChange={(event) => changeField('price', event.target.value)}
                            className={floatingInputClass}
                          />
                        </FloatingControl>
                        {fieldErrors.price && <p className="mt-1 text-xs text-danger" role="alert">{fieldErrors.price}</p>}
                      </div>
                      <div>
                        <FloatingControl id="product-stock" label={`${t('admin.form.stock')} *`}>
                          <input
                            id="product-stock" type="number" min="0" step="1" inputMode="numeric"
                            value={form.stock} disabled={locked}
                            onChange={(event) => changeField('stock', event.target.value)}
                            className={floatingInputClass}
                          />
                        </FloatingControl>
                        {fieldErrors.stock && <p className="mt-1 text-xs text-danger" role="alert">{fieldErrors.stock}</p>}
                      </div>
                      <FloatingControl id="product-status" label={t('admin.form.status')}>
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
                        placeholder="0,00" value={form.price} disabled={locked}
                        error={fieldErrors.price}
                        onChange={(event) => changeField('price', event.target.value)}
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
                  disabled={locked || uploading}
                  onAddFiles={handleAddFiles}
                  onRemove={removeItem}
                  onReorder={reorder}
                  onRetry={createdProduct ? retryItem : isEdit ? retryItem : undefined}
                  error={galleryError}
                />
              </div>
            </section>

            <section className="border-t border-border pt-6">
              <h2 className="text-lg font-semibold text-text-primary">
                {t('admin.form.section_description')}
              </h2>
              <div className="mt-4">
                {isEdit ? (
                  <FloatingControl id="product-description" label={t('admin.form.description')}>
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
                  <div className="space-y-3 border-t border-border bg-surface p-4">
                    {!form.productTypeId ? (
                      <>
                        {[0, 1, 2].map((index) => (
                          <div key={index} className="grid gap-3 sm:grid-cols-2">
                            <div className="relative">
                              <select disabled className={`${adminControl} appearance-none pr-10`} aria-label={t('admin.form.spec_param')}>
                                <option>{t('admin.form.spec_param')}</option>
                              </select>
                              <SpecChevron />
                            </div>
                            <div className="relative">
                              <select disabled className={`${adminControl} appearance-none pr-10`} aria-label={t('admin.form.spec_value')}>
                                <option>{t('admin.form.spec_value')}</option>
                              </select>
                              <SpecChevron />
                            </div>
                          </div>
                        ))}
                        <p className="text-xs text-text-muted">{t('admin.form.specs_empty')}</p>
                      </>
                    ) : template.isLoading ? (
                      <p role="status" className="text-sm text-text-muted">{t('admin.common.loading')}</p>
                    ) : template.isError ? (
                      <AdminError message={adminErrorText(template.error)} onRetry={() => void template.refetch()} compact />
                    ) : templateFields.length === 0 ? (
                      <p className="text-sm text-text-muted">{t('admin.form.specs_empty')}</p>
                    ) : (
                      templateFields.map((field) => (
                        <div key={field.id} className="grid items-center gap-3 sm:grid-cols-2">
                          <div className="relative flex h-11 items-center rounded-lg border border-border bg-surface-2 px-3.5 pr-10 text-sm text-text-primary">
                            <span className="truncate">{field.label}</span>
                            {field.is_required && <span className="ml-1 text-text-secondary" aria-hidden="true">*</span>}
                            <SpecChevron />
                          </div>
                          <div className="relative">
                            <select
                              value={form.specs[field.code] ?? ''}
                              disabled={locked}
                              aria-label={field.label}
                              onChange={(event) => {
                                setForm((current) => ({
                                  ...current,
                                  specs: { ...current.specs, [field.code]: event.target.value },
                                }))
                                setSpecsError(null)
                                setSaved(false)
                              }}
                              className={`${adminControl} appearance-none pr-10`}
                            >
                              <option value="">{t('admin.form.spec_value')}</option>
                              {(field.options ?? []).map((option) => (
                                <option key={option.id} value={option.value}>{option.value}</option>
                              ))}
                            </select>
                            <SpecChevron />
                          </div>
                        </div>
                      ))
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

function SpecChevron() {
  return (
    <svg
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
