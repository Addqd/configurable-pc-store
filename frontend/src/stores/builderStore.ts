import { create } from 'zustand'
import type { Product } from '../data/product'

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

function electricalWatts(product: Product | null): number | null {
  if (!product) return null
  for (const spec of product.specs) {
    const match = spec.match(/\b(?:TDP|TBP|TGP|потреблени[ея]|энергопотреблени[ея]|мощность\s+потреблени[яе])\b[^\d]{0,12}(\d{1,4})\s*(?:Вт|W)(?![A-Za-zА-Яа-я0-9])/i)
      ?? spec.match(/\b(\d{1,4})\s*(?:Вт|W)\s*(?:TDP|TBP|TGP)\b/i)
    if (match) { const watts = Number(match[1]); if (watts > 0 && watts <= 1500) return watts }
  }
  return null
}
export function estimateComponentPower(selections: BuilderSelections): number | null {
  const cpu = electricalWatts(selections.cpu), gpu = electricalWatts(selections.gpu)
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
