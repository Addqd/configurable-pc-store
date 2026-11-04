import { create } from 'zustand'
import { mockProducts, type Product } from '../data/mockProducts'

/** Builder component categories in display order. */
export const BUILDER_CATEGORIES: BuilderCategory[] = [
  'cpu',
  'mobo',
  'gpu',
  'ram',
  'storage',
  'psu',
  'case',
  'cooling',
]

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

export type BuilderCategory =
  | 'cpu'
  | 'mobo'
  | 'gpu'
  | 'ram'
  | 'storage'
  | 'psu'
  | 'case'
  | 'cooling'

/** Map builder categories to catalog product categories. */
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

export interface BuilderSelection {
  category: BuilderCategory
  product: Product
}

export interface CompatibilityCheck {
  status: 'compatible' | 'incompatible' | 'unknown'
  label: string
  detail?: string
}

/**
 * Product selected in the builder.
 * `null` means not yet selected.
 */
export interface BuilderState {
  selections: Record<BuilderCategory, Product | null>
  setProduct: (category: BuilderCategory, product: Product) => void
  removeProduct: (category: BuilderCategory) => void
  clearAll: () => void
  selectedCount: () => number
  totalPrice: () => number
  isComplete: () => boolean
  hasIncompatibilities: () => boolean
  checkCompatibility: () => CompatibilityCheck[]
  estimatedPower: number | null
}

export const useBuilderStore = create<BuilderState>()((set, get) => ({
  selections: {
    cpu: null,
    mobo: null,
    gpu: null,
    ram: null,
    storage: null,
    psu: null,
    case: null,
    cooling: null,
  },

  setProduct: (category, product) => {
    set((s) => ({
      selections: { ...s.selections, [category]: product },
    }))
  },

  removeProduct: (category) => {
    set((s) => ({
      selections: { ...s.selections, [category]: null },
    }))
  },

  clearAll: () => {
    set({
      selections: {
        cpu: null,
        mobo: null,
        gpu: null,
        ram: null,
        storage: null,
        psu: null,
        case: null,
        cooling: null,
      },
    })
  },

  selectedCount: () => {
    const selections = get().selections
    return BUILDER_CATEGORIES.filter(
      (cat) => selections[cat] !== null,
    ).length
  },

  totalPrice: () => {
    let total = 0
    for (const cat of BUILDER_CATEGORIES) {
      const product = get().selections[cat]
      if (product) total += product.price
    }
    return total
  },

  isComplete: () => {
    return get().selectedCount() === BUILDER_CATEGORIES.length && !get().hasIncompatibilities()
  },

  hasIncompatibilities: () => {
    return get().checkCompatibility().some(
      (check) => check.status === 'incompatible',
    )
  },

  checkCompatibility: () => {
    const checks: CompatibilityCheck[] = []
    const { selections } = get()

    // 1. CPU socket ↔ motherboard socket
    if (selections.cpu && selections.mobo) {
      const cpuSockets = selections.cpu.specs.filter((s) => /AM\d|LGA\s*\d+/i.test(s))
      const moboSockets = selections.mobo.specs.filter((s) => /AM\d|LGA\s*\d+/i.test(s))
      const cpuSocket = cpuSockets[0]?.trim()
      const moboSocket = moboSockets[0]?.trim()
      if (cpuSocket && moboSocket) {
        if (cpuSocket === moboSocket) {
          checks.push({ status: 'compatible', label: 'Сокет процессора', detail: cpuSocket })
        } else {
          checks.push({
            status: 'incompatible',
            label: 'Сокет процессора',
            detail: `Процессор: ${cpuSocket} · Материнская плата: ${moboSocket}`,
          })
        }
      } else {
        checks.push({ status: 'unknown', label: 'Сокет процессора' })
      }
    }

    // 2. RAM type ↔ motherboard memory support
    if (selections.ram && selections.mobo) {
      const ramType = selections.ram.specs.find((s) => /DDR\d/i.test(s))
      const moboRamType = selections.mobo.specs.find((s) => /DDR\d/i.test(s))
      if (ramType && moboRamType) {
        if (ramType === moboRamType) {
          checks.push({ status: 'compatible', label: 'Тип памяти', detail: ramType })
        } else {
          checks.push({
            status: 'incompatible',
            label: 'Тип памяти',
            detail: `RAM: ${ramType} · Материнская плата: ${moboRamType}`,
          })
        }
      } else {
        checks.push({ status: 'unknown', label: 'Тип памяти' })
      }
    }

    // 3. Motherboard form factor ↔ case support
    if (selections.mobo && selections.case) {
      const moboFormFactor = selections.mobo.specs.find((s) => /^(ATX|mATX|Micro-ATX|ITX)$/i.test(s))
      if (moboFormFactor) {
        const ff = moboFormFactor.toUpperCase()
        const caseSpecs = selections.case.specs.join(' ').toUpperCase()
        // Most ATX cases support ATX, mATX, and sometimes Micro-ATX
        if (ff.includes('ATX') && caseSpecs.includes('ATX')) {
          checks.push({ status: 'compatible', label: 'Форм-фактор', detail: `Мат. плата ${moboFormFactor} поддерживается корпусом` })
        } else if (ff.includes('MATX') && (caseSpecs.includes('MATX') || caseSpecs.includes('ATX'))) {
          checks.push({ status: 'compatible', label: 'Форм-фактор', detail: `Мат. плата ${moboFormFactor} поддерживается корпусом` })
        } else if (ff.includes('ITX') && caseSpecs.includes('ITX')) {
          checks.push({ status: 'compatible', label: 'Форм-фактор', detail: `Мат. плата ${moboFormFactor} поддерживается корпусом` })
        } else {
          checks.push({
            status: 'unknown',
            label: 'Форм-фактор',
            detail: `Мат. плата: ${moboFormFactor}, поддержка корпуса не определена`,
          })
        }
      } else {
        checks.push({ status: 'unknown', label: 'Форм-фактор' })
      }
    }

    // 4. GPU length vs case support
    if (selections.gpu && selections.case) {
      const gpuLength = selections.gpu.specs.find((s) => /до\s*\d+\s*мм|支持.*\d+mm/i.test(s))
      const caseGpuSupport = selections.case.specs.find((s) => /GPU.*\d+|видеокарт.*\d+|поддерживает.*\d+|до\s*\d+\s*мм/i.test(s))
      if (gpuLength && caseGpuSupport) {
        checks.push({ status: 'compatible', label: 'Длина видеокарты', detail: 'Подходит по длине' })
      } else {
        checks.push({ status: 'unknown', label: 'Длина видеокарты' })
      }
    }

    // 5. PSU wattage estimation
    if (selections.cpu && selections.gpu && selections.psu) {
      const cpuWattage = getTdpFromSpecs(selections.cpu.specs)
      const gpuWattage = getTdpFromSpecs(selections.gpu.specs)
      const psuWattage = Number(selections.psu.specs.find((s) => /\d+\s*Вт/i.test(s))?.match(/\d+/)?.[0])

      if (cpuWattage && gpuWattage && psuWattage) {
        const estimated = cpuWattage + gpuWattage + 80 // +80 for other components
        if (estimated <= psuWattage) {
          checks.push({
            status: 'compatible',
            label: 'Мощность БП',
            detail: `Расчёт: ~${estimated} Вт, БП: ${psuWattage} Вт`,
          })
        } else {
          checks.push({
            status: 'incompatible',
            label: 'Мощность БП',
            detail: `Расчёт: ~${estimated} Вт, БП: ${psuWattage} Вт — может не хватить`,
          })
        }
      } else {
        checks.push({ status: 'unknown', label: 'Мощность БП' })
      }
    }

    // 6. CPU cooler compatibility
    if (selections.cooling && selections.cpu) {
      const coolerSockets = selections.cooling.specs.filter((s) => /Intel|AMD|LGA|AM\d/i.test(s))
      const cpuSockets = selections.cpu.specs.filter((s) => /AM\d|LGA\s*\d+/i.test(s))
      if (coolerSockets.length > 0 && cpuSockets.length > 0) {
        const hasIntel = coolerSockets.some((s) => /Intel|LGA/i.test(s))
        const hasAMD = coolerSockets.some((s) => /AMD|AM\d/i.test(s))
        const cpuIsIntel = cpuSockets.some((s) => /LGA/i.test(s))
        const cpuIsAMD = cpuSockets.some((s) => /AM\d/i.test(s))
        if (
          (cpuIsIntel && hasIntel) ||
          (cpuIsAMD && hasAMD) ||
          (cpuIsIntel && cpuIsAMD && hasIntel && hasAMD) ||
          (coolerSockets.length > 0 && (hasIntel || hasAMD))
        ) {
          checks.push({ status: 'compatible', label: 'Совместимость охлаждения', detail: 'Поддерживает сокет процессора' })
        } else {
          checks.push({
            status: 'incompatible',
            label: 'Совместимость охлаждения',
            detail: 'Сокет процессора не указан в поддержке кулера',
          })
        }
      } else {
        checks.push({ status: 'unknown', label: 'Совместимость охлаждения' })
      }
    }

    return checks
  },

  estimatedPower: () => {
    const { selections } = get()
    let total = 0
    let hasData = true

    if (selections.cpu) {
      const w = getTdpFromSpecs(selections.cpu.specs)
      total += w ?? 0
      if (w === null) hasData = false
    }
    if (selections.gpu) {
      const w = getTdpFromSpecs(selections.gpu.specs)
      total += w ?? 0
      if (w === null) hasData = false
    }

    // Add base for other components if we have at least CPU and GPU
    if (selections.cpu && selections.gpu) {
      total += 80 // motherboard, RAM, storage, fans
      hasData = hasData && true
    }

    return hasData ? total : null
  },
}))

/**
 * Extract TDP (wattage) from product specs.
 * Returns null if not found — don't invent numbers.
 */
function getTdpFromSpecs(specs: string[]): number | null {
  // Look for patterns like "до 170 Вт", "TDP 120W", "170W", etc.
  for (const spec of specs) {
    const match = spec.match(/(\d+)\s*(Вт|W|watt|TDP|tj)/i)
    if (match) {
      const val = Number(match[1])
      if (val > 0 && val < 2000) return val
    }
  }
  return null
}

/** Get all available products for a builder category from the catalog. */
export function getProductsForCategory(category: BuilderCategory): Product[] {
  const catalogCat = CATALOG_CATEGORY_MAP[category]
  return mockProducts.filter((p) => p.category === catalogCat)
}
