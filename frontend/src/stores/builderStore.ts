import { create } from 'zustand'
import type { Product } from '../data/product'
import { characteristicNumber } from '../data/product'

export const BUILDER_CATEGORIES = ['cpu', 'mobo', 'gpu', 'ram', 'storage', 'psu', 'case', 'cooling'] as const
export type BuilderCategory = typeof BUILDER_CATEGORIES[number]
export type BuilderSelections = Record<BuilderCategory, Product | null>
export const CATEGORY_LABELS: Record<BuilderCategory, string> = {
  cpu: 'Процессор', mobo: 'Материнская плата', gpu: 'Видеокарта', ram: 'Оперативная память',
  storage: 'Накопитель', psu: 'Блок питания', case: 'Корпус', cooling: 'Охлаждение',
}
export const CATALOG_CATEGORY_MAP: Record<BuilderCategory, string> = {
  cpu: 'Процессоры', mobo: 'Материнские платы', gpu: 'Видеокарты', ram: 'Оперативная память',
  storage: 'Накопители', psu: 'Блоки питания', case: 'Корпуса', cooling: 'Охлаждение',
}
export const BUILDER_CATEGORY_KEYS: Record<BuilderCategory, string> = {
  cpu: 'builder.components.cpu', mobo: 'builder.components.mobo', gpu: 'builder.components.gpu',
  ram: 'builder.components.ram', storage: 'builder.components.storage', psu: 'builder.components.psu',
  case: 'builder.components.case', cooling: 'builder.components.cooling',
}
export function emptyBuilderSelections(): BuilderSelections {
  return { cpu: null, mobo: null, gpu: null, ram: null, storage: null, psu: null, case: null, cooling: null }
}
export const countSelected = (selections: BuilderSelections) => BUILDER_CATEGORIES.filter(slot => selections[slot] !== null).length
export const calculateBuilderPrice = (selections: BuilderSelections) => BUILDER_CATEGORIES.reduce((sum, slot) => sum + (selections[slot]?.price ?? 0), 0)

function electricalWatts(product: Product | null, code: string): number | null {
  // Only a declared, finite, positive numeric characteristic counts as evidence.
  const watts = characteristicNumber(product, code)
  return watts !== null && watts > 0 && watts <= 1500 ? watts : null
}
export function estimateComponentPower(selections: BuilderSelections): number | null {
  const cpu = electricalWatts(selections.cpu, 'thermal_design_power_w')
  const gpu = electricalWatts(selections.gpu, 'max_power_draw_w')
  return cpu !== null && gpu !== null ? cpu + gpu : null
}

interface BuilderState {
  selections: BuilderSelections
  editingBuildId: number | null
  setProduct: (category: BuilderCategory, product: Product) => void
  removeProduct: (category: BuilderCategory) => void
  clearAll: () => void
  startNewBuild: () => void
}

/** Only an unsaved in-memory draft belongs here; saved builds live on the server. */
export const useBuilderStore = create<BuilderState>()((set) => ({
  selections: emptyBuilderSelections(), editingBuildId: null,
  setProduct: (category, product) => {
    if (product.category !== CATALOG_CATEGORY_MAP[category] || !Number.isFinite(product.price) || product.price < 0) return
    set(state => ({ selections: { ...state.selections, [category]: product } }))
  },
  removeProduct: category => set(state => ({ selections: { ...state.selections, [category]: null } })),
  clearAll: () => set({ selections: emptyBuilderSelections(), editingBuildId: null }),
  startNewBuild: () => set({ selections: emptyBuilderSelections(), editingBuildId: null }),
}))
