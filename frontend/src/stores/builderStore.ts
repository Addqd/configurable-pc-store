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

export interface SavedBuild {
  id: number
  name: string
  description: string
  totalPrice: number
  image: string
  components: BuildComponent[]
  savedAt: number
  ownerId: string
  isCompatible: boolean
}

export interface BuilderState {
  selections: BuilderSelections
  savedBuilds: SavedBuild[]
  nextSavedBuildId: number
  setProduct: (category: BuilderCategory, product: Product) => void
  removeProduct: (category: BuilderCategory) => void
  clearAll: () => void
  selectedCount: () => number
  totalPrice: () => number
  isComplete: () => boolean
  hasIncompatibilities: () => boolean
  checkCompatibility: () => CompatibilityCheck[]
  estimatedPower: () => number | null
  saveBuild: (name: string, description: string, image: string, owner: string) => SavedBuild
  deleteSavedBuild: (id: number) => void
  restoreBuild: (id: number) => void
  getSavedBuild: (id: number) => SavedBuild | undefined
  saveBuildsForAccount: (accountId: string) => SavedBuild[]
}

export const useBuilderStore = create<BuilderState>()(persist(
  (set, get) => ({
    selections: emptyBuilderSelections(),
    savedBuilds: [],
    nextSavedBuildId: 1,
    setProduct: (category, product) => {
      // UI should not be able to attach a GPU to the CPU slot, even accidentally.
      if (product.category !== CATALOG_CATEGORY_MAP[category] || !Number.isFinite(product.price) || product.price < 0) return
      set((state) => ({ selections: { ...state.selections, [category]: product } }))
    },
    removeProduct: (category) => set((state) => ({ selections: { ...state.selections, [category]: null } })),
    clearAll: () => set({ selections: emptyBuilderSelections() }),
    selectedCount: () => countSelected(get().selections),
    totalPrice: () => calculateBuilderPrice(get().selections),
    isComplete: () => isBuildCartEligible(get().selections),
    hasIncompatibilities: () => checkBuildCompatibility(get().selections).some((check) => check.status === 'incompatible'),
    checkCompatibility: () => checkBuildCompatibility(get().selections),
    estimatedPower: () => estimateComponentPower(get().selections),

    saveBuild: (name, description, image, owner) => {
      const selections = get().selections
      const compatible = isBuildCartEligible(selections)
      if (!compatible) return get().savedBuilds[0] ?? { id: 0, name: '', description: '', totalPrice: 0, image: '', components: [], savedAt: 0, ownerId: '', isCompatible: false }
      const components = BUILDER_CATEGORIES.map((category) => {
        const product = selections[category]!
        return {
          category: CATEGORY_LABELS[category],
          name: product.name,
          specs: product.specs.join(', '),
          quantity: 1,
          image: product.image || '',
        }
      })
      const id = get().nextSavedBuildId
      const build: SavedBuild = {
        id, name, description, totalPrice: calculateBuilderPrice(selections),
        image: selections.case?.image || image,
        components, savedAt: Date.now(), ownerId: owner, isCompatible: true,
      }
      set((state) => ({ savedBuilds: [...state.savedBuilds, build], nextSavedBuildId: id + 1 }))
      return build
    },

    deleteSavedBuild: (id) => set((state) => ({
      savedBuilds: state.savedBuilds.filter((b) => b.id !== id),
    })),

    restoreBuild: (id) => {
      const build = get().savedBuilds.find((b) => b.id === id)
      if (!build) return
      const selections: BuilderSelections = emptyBuilderSelections()
      for (const comp of build.components) {
        const category = BUILDER_CATEGORIES.find((c) => CATEGORY_LABELS[c] === comp.category)
        if (category) selections[category] = {
          id: 0, name: comp.name, price: 0, specs: comp.specs.split(', '),
          category: '', image: comp.image || '', type: comp.category,
        } as unknown as Product
      }
      set({ selections })
    },

    getSavedBuild: (id) => get().savedBuilds.find((b) => b.id === id),

    saveBuildsForAccount: (accountId) => get().savedBuilds.filter((b) => b.ownerId === accountId),
  }),
  {
    name: 'pc-builder-saved', version: 1,
    partialize: (s) => ({ savedBuilds: s.savedBuilds, nextSavedBuildId: s.nextSavedBuildId }),
    merge: (saved, current) => {
      const s = saved && typeof saved === 'object' ? saved as Partial<Pick<BuilderState, 'savedBuilds' | 'nextSavedBuildId'>> : {}
      const builds = Array.isArray(s.savedBuilds) ? s.savedBuilds : []
      const maxId = builds.reduce((n, b) => Math.max(n, Number.isSafeInteger(b?.id) ? b.id : 0), 0)
      return {
        ...current,
        savedBuilds: builds,
        nextSavedBuildId: Math.max(maxId + 1, Number.isSafeInteger(s.nextSavedBuildId) ? s.nextSavedBuildId! : 1),
      }
    },
  },
))
