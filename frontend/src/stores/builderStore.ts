import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mockProducts, type Product } from '../data/mockProducts'
import type { BuildCartItem, BuildComponent } from './cartStore'

export const BUILDER_CATEGORIES = ['cpu', 'mobo', 'gpu', 'ram', 'storage', 'psu', 'case', 'cooling'] as const
export type BuilderCategory = typeof BUILDER_CATEGORIES[number]
export type BuilderSelections = Record<BuilderCategory, Product | null>

export const CATEGORY_LABELS: Record<BuilderCategory, string> = {
  cpu: 'Процессор',
  mobo: 'Материнская плата',
  gpu: 'Видеокарта',
  ram: 'Оперативная память',
  storage: 'Накопитель',
  psu: 'Блок питания',
  case: 'Корпус',
  cooling: 'Охлаждение',
}

export const CATALOG_CATEGORY_MAP: Record<BuilderCategory, string> = {
  cpu: 'Процессоры',
  mobo: 'Материнские платы',
  gpu: 'Видеокарты',
  ram: 'Оперативная память',
  storage: 'Накопители',
  psu: 'Блоки питания',
  case: 'Корпуса',
  cooling: 'Охлаждение',
}

export interface CompatibilityCheck {
  status: 'compatible' | 'incompatible' | 'unknown'
  label: string
  detail?: string
}

export function emptyBuilderSelections(): BuilderSelections {
  return { cpu: null, mobo: null, gpu: null, ram: null, storage: null, psu: null, case: null, cooling: null }
}

export function getProductsForCategory(category: BuilderCategory): Product[] {
  return mockProducts.filter((product) => product.category === CATALOG_CATEGORY_MAP[category])
}

export function countSelected(selections: BuilderSelections): number {
  return BUILDER_CATEGORIES.filter((category) => selections[category] !== null).length
}

export function calculateBuilderPrice(selections: BuilderSelections): number {
  return BUILDER_CATEGORIES.reduce((sum, category) => sum + (selections[category]?.price ?? 0), 0)
}

function textFor(product: Product | null): string {
  return product ? [product.type, product.name, ...product.specs].join(' ') : ''
}

function socket(product: Product | null): string | null {
  if (!product) return null
  const raw = product.specs.join(' ')
  const match = raw.match(/\bAM[345]\b|\bLGA[\s-]?\d{4}\b/i)
  return match ? match[0].toUpperCase().replace(/[\s-]/g, '') : null
}

function memoryType(product: Product | null): string | null {
  const match = textFor(product).match(/\bDDR[345]\b/i)
  return match ? match[0].toUpperCase() : null
}

type FormFactor = 'ATX' | 'MATX' | 'ITX'
function formFactor(product: Product | null): FormFactor | null {
  if (!product) return null
  const raw = [product.type, ...product.specs].join(' ')
  if (/\b(?:micro[ -]?atx|m[ -]?atx)\b/i.test(raw)) return 'MATX'
  if (/\b(?:mini[ -]?itx|itx)\b/i.test(raw)) return 'ITX'
  if (/\bATX\b/i.test(raw)) return 'ATX'
  return null
}

/** Only explicitly stated component consumption; cooler heat-dissipation ratings do NOT count. */
function electricalWatts(product: Product | null): number | null {
  if (!product) return null
  for (const spec of product.specs) {
    const match = spec.match(/\b(?:TDP|TBP|TGP|потреблени[ея]|энергопотреблени[ея]|мощность\s+потреблени[яе])\b[^\d]{0,12}(\d{1,4})\s*(?:Вт|W)(?![A-Za-zА-Яа-я0-9])/i)
      ?? spec.match(/\b(\d{1,4})\s*(?:Вт|W)\s*(?:TDP|TBP|TGP)\b/i)
    if (match) {
      const watts = Number(match[1])
      if (watts > 0 && watts <= 1500) return watts
    }
  }
  return null
}

function psuWatts(product: Product | null): number | null {
  if (!product) return null
  const pattern = /\b(\d{2,4})\s*(?:Вт|W)(?![A-Za-zА-Яа-я0-9])/i
  const fromName = product.name.match(pattern)?.[1]
  const fromSpecs = product.specs.map((spec) => spec.match(pattern)?.[1]).filter((value): value is string => Boolean(value))
  const declared = [...fromSpecs, ...(fromName ? [fromName] : [])].map(Number)
  if (!declared.length || declared.some((watts) => watts !== declared[0])) return null
  return declared[0]
}

/** Lower bound for CPU + GPU only, NOT total system consumption. */
export function estimateComponentPower(selections: BuilderSelections): number | null {
  const cpu = electricalWatts(selections.cpu)
  const gpu = electricalWatts(selections.gpu)
  return cpu !== null && gpu !== null ? cpu + gpu : null
}

/** Pure evaluation, based solely on available catalog metadata. No fabricated fitment or power data. */
export function checkBuildCompatibility(selections: BuilderSelections): CompatibilityCheck[] {
  const checks: CompatibilityCheck[] = []
  const add = (status: CompatibilityCheck['status'], label: string, detail: string) => {
    checks.push({ status, label, detail })
  }

  if (selections.cpu && selections.mobo) {
    const a = socket(selections.cpu)
    const b = socket(selections.mobo)
    add(!a || !b ? 'unknown' : a === b ? 'compatible' : 'incompatible', 'Сокет CPU и платы',
      !a || !b ? 'В каталоге нет данных о сокете' : `CPU: ${a}, плата: ${b}`)
  }

  if (selections.ram && selections.mobo) {
    const a = memoryType(selections.ram)
    const b = memoryType(selections.mobo)
    add(!a || !b ? 'unknown' : a === b ? 'compatible' : 'incompatible', 'Тип оперативной памяти',
      !a || !b ? 'В каталоге нет данных о типе памяти' : `RAM: ${a}, плата: ${b}`)
  }

  if (selections.mobo && selections.case) {
    const board = formFactor(selections.mobo)
    const chassis = formFactor(selections.case)
    // A case's listed form factor is not a complete support matrix.
    // We can confirm identical size or reject a board larger than its case.
    const confirmed = Boolean(board && chassis && board === chassis)
    const tooLarge = board === 'ATX' && (chassis === 'MATX' || chassis === 'ITX')
      || board === 'MATX' && chassis === 'ITX'
    add(confirmed ? 'compatible' : tooLarge ? 'incompatible' : 'unknown', 'Форм-фактор корпуса и платы',
      !board || !chassis ? 'Не указан форм-фактор' : confirmed ? `${board}: совпадает с форм-фактором корпуса` : tooLarge ? `Плата ${board} больше корпуса ${chassis}` : 'Нужен список поддерживаемых форм-факторов корпуса')
  }

  if (selections.cooling && selections.cpu) {
    const cpuSocket = socket(selections.cpu)
    const supported = selections.cooling.specs.join(' ').match(/\bAM[345]\b|\bLGA[\s-]?\d{4}\b/gi)?.map((value) => value.toUpperCase().replace(/[\s-]/g, ''))
    // A generic Intel/AMD label (or heat dissipation rating) is not proof of socket support.
    add(!cpuSocket || !supported?.length ? 'unknown' : supported.includes(cpuSocket) ? 'compatible' : 'incompatible',
      'Совместимость охлаждения',
      !cpuSocket || !supported?.length ? 'Точный список сокетов кулера неизвестен' : `Сокет CPU: ${cpuSocket}; кулер: ${supported.join(', ')}`)
  }

  if (selections.gpu && selections.case) {
    add('unknown', 'Габариты видеокарты', 'Нет сопоставимых данных о длине GPU и допустимой длине в корпусе')
  }

  if (selections.cpu && selections.gpu && selections.psu) {
    const lowerBound = estimateComponentPower(selections)
    const maxPower = psuWatts(selections.psu)
    add(lowerBound !== null && maxPower !== null && lowerBound > maxPower ? 'incompatible' : 'unknown',
      'Мощность блока питания',
      lowerBound === null || maxPower === null
        ? 'Недостаточно данных о потреблении CPU/GPU или мощности БП'
        : lowerBound > maxPower
          ? `CPU + GPU требуют минимум ${lowerBound} Вт, БП рассчитан на ${maxPower} Вт`
          : `CPU + GPU: ${lowerBound} Вт; прочие потребители и запас не учтены — нельзя подтвердить достаточность ${maxPower} Вт`)
  }

  return checks
}

export function isBuildCartEligible(selections: BuilderSelections): boolean {
  return countSelected(selections) === BUILDER_CATEGORIES.length &&
    !checkBuildCompatibility(selections).some((check) => check.status === 'incompatible')
}

/** Cart-ready immutable snapshot; kept reusable for TASK 007 without persisting drafts yet. */
export function createBuildCartPayload(
  selections: BuilderSelections, id: number, fallbackImage: string,
): Omit<BuildCartItem, 'quantity' | 'isExpanded'> | null {
  if (!isBuildCartEligible(selections) || !Number.isSafeInteger(id)) return null
  return {
    id,
    name: 'Сборка ПК',
    price: calculateBuilderPrice(selections),
    image: selections.case?.image || fallbackImage,
    description: 'Пользовательская конфигурация из 8 компонентов (демо)',
    category: 'Готовые сборки',
    specs: '',
    components: BUILDER_CATEGORIES.map((category) => {
      const product = selections[category]!
      return {
        category: CATEGORY_LABELS[category],
        name: product.name,
        specs: product.specs.join(', '),
        quantity: 1,
        image: product.image || fallbackImage,
      }
    }),
  }
}

/** Persistent demo build, scoped by ownerId. No real backend authorization is implied. */
export interface SavedBuild {
  id: number
  name: string
  description: string
  totalPrice: number
  image: string
  components: BuildComponent[]
  savedAt: number
  updatedAt?: number
  version?: number
  ownerId: string
  /** No *confirmed* conflicts. Unknown checks are NOT proof of compatibility. */
  isCompatible: boolean
  /** Original product snapshots allow lossless reopen/edit, without zero-price placeholders. */
  selections?: BuilderSelections
}

/** Do not share mutable spec arrays between a draft and a saved snapshot. */
function cloneSelections(source: BuilderSelections): BuilderSelections {
  const next = emptyBuilderSelections()
  for (const category of BUILDER_CATEGORIES) {
    const product = source[category]
    next[category] = product ? {
      ...product,
      specs: [...product.specs],
      ...(product.shortSpecs ? { shortSpecs: [...product.shortSpecs] } : {}),
    } : null
  }
  return next
}

/** Restores current snapshots or legacy saved builds using exact existing catalog products. */
export function selectionsFromSavedBuild(build: SavedBuild): BuilderSelections | null {
  const selections = emptyBuilderSelections()
  if (build.selections) {
    for (const category of BUILDER_CATEGORIES) {
      const product = build.selections[category]
      if (!product || product.category !== CATALOG_CATEGORY_MAP[category] ||
          !Number.isSafeInteger(product.id) || product.id < 1 ||
          !Number.isFinite(product.price) || product.price < 0 ||
          !Array.isArray(product.specs)) return null
      selections[category] = product
    }
  } else {
    // Compatibility with TASK 007's first SavedBuild records, which only saved names.
    for (const category of BUILDER_CATEGORIES) {
      const component = build.components.find((item) => item.category === CATEGORY_LABELS[category])
      if (!component) return null
      const product = getProductsForCategory(category).find((item) => item.name === component.name)
      if (!product) return null
      selections[category] = product
    }
  }
  return isBuildCartEligible(selections) ? cloneSelections(selections) : null
}

export function savedBuildHasUnknownChecks(build: SavedBuild): boolean {
  const selections = selectionsFromSavedBuild(build)
  return !selections || checkBuildCompatibility(selections).some((check) => check.status === 'unknown')
}

export interface BuilderState {
  selections: BuilderSelections
  editingBuildId: number | null
  savedBuilds: SavedBuild[]
  nextSavedBuildId: number
  setProduct: (category: BuilderCategory, product: Product) => void
  removeProduct: (category: BuilderCategory) => void
  clearAll: () => void
  startNewBuild: () => void
  selectedCount: () => number
  totalPrice: () => number
  isComplete: () => boolean
  hasIncompatibilities: () => boolean
  checkCompatibility: () => CompatibilityCheck[]
  estimatedPower: () => number | null
  saveBuild: (name: string, description: string, image: string, ownerId: string) => SavedBuild | null
  deleteSavedBuild: (id: number, ownerId: string) => boolean
  restoreBuild: (id: number, ownerId: string) => boolean
  getSavedBuild: (id: number, ownerId: string) => SavedBuild | undefined
  saveBuildsForAccount: (ownerId: string) => SavedBuild[]
  removeBuildsForAccount: (ownerId: string) => void
}

function validSavedBuild(value: unknown): value is SavedBuild {
  if (!value || typeof value !== 'object') return false
  const build = value as Partial<SavedBuild>
  return Number.isSafeInteger(build.id) && build.id! > 0 &&
    typeof build.ownerId === 'string' && build.ownerId.length > 0 &&
    typeof build.name === 'string' && typeof build.description === 'string' &&
    typeof build.totalPrice === 'number' && Number.isFinite(build.totalPrice) && build.totalPrice >= 0 &&
    typeof build.image === 'string' && typeof build.savedAt === 'number' &&
    Number.isFinite(build.savedAt) && Array.isArray(build.components) &&
    typeof build.isCompatible === 'boolean'
}

export const useBuilderStore = create<BuilderState>()(persist(
  (set, get) => ({
    selections: emptyBuilderSelections(),
    editingBuildId: null,
    savedBuilds: [],
    nextSavedBuildId: 1,
    setProduct: (category, product) => {
      if (product.category !== CATALOG_CATEGORY_MAP[category] || !Number.isFinite(product.price) || product.price < 0) return
      set((state) => ({ selections: { ...state.selections, [category]: product } }))
    },
    removeProduct: (category) => set((state) => ({ selections: { ...state.selections, [category]: null } })),
    clearAll: () => set({ selections: emptyBuilderSelections(), editingBuildId: null }),
    startNewBuild: () => set({ selections: emptyBuilderSelections(), editingBuildId: null }),
    selectedCount: () => countSelected(get().selections),
    totalPrice: () => calculateBuilderPrice(get().selections),
    isComplete: () => isBuildCartEligible(get().selections),
    hasIncompatibilities: () => checkBuildCompatibility(get().selections).some((check) => check.status === 'incompatible'),
    checkCompatibility: () => checkBuildCompatibility(get().selections),
    estimatedPower: () => estimateComponentPower(get().selections),

    saveBuild: (name, description, image, ownerId) => {
      const { selections, editingBuildId, savedBuilds, nextSavedBuildId } = get()
      const trimmedName = name.trim()
      if (!ownerId || !trimmedName || trimmedName.length > 100 ||
          !isBuildCartEligible(selections)) return null
      const existing = editingBuildId === null ? undefined : savedBuilds.find(
        (build) => build.id === editingBuildId && build.ownerId === ownerId)
      // Never silently duplicate someone else's or a deleted draft.
      if (editingBuildId !== null && !existing) return null

      const snapshot = cloneSelections(selections)
      const now = Date.now()
      const next: SavedBuild = {
        id: existing?.id ?? nextSavedBuildId,
        name: trimmedName,
        description: description.trim().slice(0, 300),
        totalPrice: calculateBuilderPrice(snapshot),
        image: selections.case?.image || image,
        components: BUILDER_CATEGORIES.map((category) => {
          const product = snapshot[category]!
          return {
            category: CATEGORY_LABELS[category], name: product.name,
            specs: product.specs.join(', '), quantity: 1,
            image: product.image || '',
          }
        }),
        savedAt: existing?.savedAt ?? now,
        updatedAt: now,
        version: (existing?.version ?? 0) + 1,
        ownerId,
        isCompatible: true,
        selections: snapshot,
      }
      set((state) => ({
        savedBuilds: existing
          ? state.savedBuilds.map((build) => build.id === existing.id ? next : build)
          : [...state.savedBuilds, next],
        nextSavedBuildId: existing ? state.nextSavedBuildId : nextSavedBuildId + 1,
        editingBuildId: next.id,
      }))
      return next
    },

    deleteSavedBuild: (id, ownerId) => {
      if (!ownerId || !get().savedBuilds.some((b) => b.id === id && b.ownerId === ownerId)) return false
      set((state) => ({
        savedBuilds: state.savedBuilds.filter((b) => b.id !== id || b.ownerId !== ownerId),
        ...(state.editingBuildId === id
          ? { editingBuildId: null, selections: emptyBuilderSelections() }
          : {}),
      }))
      return true
    },

    restoreBuild: (id, ownerId) => {
      const build = get().savedBuilds.find((b) => b.id === id && b.ownerId === ownerId)
      if (!build) return false
      const selections = selectionsFromSavedBuild(build)
      if (!selections) return false
      set({ selections, editingBuildId: id })
      return true
    },
    getSavedBuild: (id, ownerId) => get().savedBuilds.find((b) => b.id === id && b.ownerId === ownerId),
    saveBuildsForAccount: (ownerId) => get().savedBuilds.filter((b) => b.ownerId === ownerId),
    removeBuildsForAccount: (ownerId) => {
      if (!ownerId) return
      const editingId = get().editingBuildId
      const editingOwner = editingId === null ? null : get().savedBuilds.find((b) => b.id === editingId)?.ownerId
      set((state) => ({
        savedBuilds: state.savedBuilds.filter((b) => b.ownerId !== ownerId),
        ...(editingOwner === ownerId ? { editingBuildId: null, selections: emptyBuilderSelections() } : {}),
      }))
    },
  }),
  {
    name: 'pc-builder-saved',
    version: 1,
    partialize: (state) => ({ savedBuilds: state.savedBuilds, nextSavedBuildId: state.nextSavedBuildId }),
    merge: (stored, current) => {
      const raw = stored && typeof stored === 'object' ? stored as Partial<BuilderState> : {}
      const savedBuilds = Array.isArray(raw.savedBuilds) ? raw.savedBuilds.filter(validSavedBuild) : []
      const maxId = savedBuilds.reduce((max, build) => Math.max(max, build.id), 0)
      return {
        ...current,
        savedBuilds,
        nextSavedBuildId: Math.max(maxId + 1, Number.isSafeInteger(raw.nextSavedBuildId) && (raw.nextSavedBuildId ?? 0) > 0 ? raw.nextSavedBuildId! : 1),
      }
    },
  },
))
