import { create } from 'zustand'
import type { Product } from '../data/product'
import { characteristicNumber } from '../data/product'
import type { CompatibilityStatus } from '../api/generated/model'

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

/**
 * Explicit compatibility lifecycle of the current configuration.
 *
 * `idle` is the absence of a verification (nothing has been checked for the
 * current selections yet). The other phases describe one explicit server check.
 */
export type CompatibilityPhase = 'checking' | 'compatible' | 'incompatible' | 'unknown' | 'failed'

export interface BuildVerification {
  /**
   * Identity of one verification attempt. It is allocated per Create Build and
   * never reused, so two attempts for the same configuration stay distinct.
   */
  requestId: number
  /** Exact selections the server answered for; any change invalidates it. */
  signature: string
  phase: CompatibilityPhase
  /** Per-check rows of the server verdict (empty while checking or failed). */
  checks: CompatibilityStatus[]
}

/** Stable identity of one configuration: two different parts never share it. */
export function selectionSignature(selections: BuilderSelections): string {
  return BUILDER_CATEGORIES.map(slot => `${slot}:${selections[slot]?.id ?? '-'}`).join('|')
}

interface BuilderState {
  selections: BuilderSelections
  editingBuildId: number | null
  verification: BuildVerification | null
  setProduct: (category: BuilderCategory, product: Product) => void
  removeProduct: (category: BuilderCategory) => void
  clearAll: () => void
  startNewBuild: () => void
  /** Restore a saved configuration; its verification always starts from idle. */
  openSavedBuild: (selections: BuilderSelections, buildId: number) => void
  /** Allocates the identity of a new attempt and marks it as the pending one. */
  startVerification: (signature: string) => number
  /** Applies a response only for the still pending attempt it belongs to. */
  settleVerification: (requestId: number, signature: string, phase: Exclude<CompatibilityPhase, 'checking'>, checks: CompatibilityStatus[]) => boolean
  resetVerification: () => void
}

/**
 * Monotonic attempt counter of this store instance. It intentionally survives
 * resets: a cleared configuration must not let an old response look current.
 */
let lastVerificationRequestId = 0

/** Only an unsaved in-memory draft belongs here; saved builds live on the server. */
export const useBuilderStore = create<BuilderState>()((set, get) => ({
  selections: emptyBuilderSelections(), editingBuildId: null, verification: null,
  setProduct: (category, product) => {
    if (product.category !== CATALOG_CATEGORY_MAP[category] || !Number.isFinite(product.price) || product.price < 0) return
    set(state => ({ selections: { ...state.selections, [category]: product }, verification: null }))
  },
  removeProduct: category => set(state => ({ selections: { ...state.selections, [category]: null }, verification: null })),
  clearAll: () => set({ selections: emptyBuilderSelections(), editingBuildId: null, verification: null }),
  startNewBuild: () => set({ selections: emptyBuilderSelections(), editingBuildId: null, verification: null }),
  openSavedBuild: (selections, buildId) => set({ selections, editingBuildId: buildId, verification: null }),
  startVerification: signature => {
    lastVerificationRequestId += 1
    const requestId = lastVerificationRequestId
    set({ verification: { requestId, signature, phase: 'checking', checks: [] } })
    return requestId
  },
  settleVerification: (requestId, signature, phase, checks) => {
    const current = get().verification
    // Same configuration but a different attempt means an older response: it must
    // not settle the newer request, let alone one that was already reset.
    if (!current || current.requestId !== requestId || current.signature !== signature || current.phase !== 'checking') return false
    set({ verification: { ...current, phase, checks } })
    return true
  },
  resetVerification: () => set({ verification: null }),
}))
