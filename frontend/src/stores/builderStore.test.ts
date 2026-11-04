import { beforeEach, describe, expect, it } from 'vitest'
import { mockProducts, type Product } from '../data/mockProducts'
import { useCartStore } from './cartStore'
import {
  useBuilderStore, BUILDER_CATEGORIES, CATALOG_CATEGORY_MAP, emptyBuilderSelections,
  getProductsForCategory, calculateBuilderPrice, countSelected, checkBuildCompatibility,
  isBuildCartEligible, estimateComponentPower, createBuildCartPayload,
  type BuilderCategory, type BuilderSelections,
} from './builderStore'

const pick = (category: BuilderCategory, name?: string): Product => {
  const products = getProductsForCategory(category)
  const product = name ? products.find((candidate) => candidate.name.includes(name)) : products[0]
  if (!product) throw new Error(`Missing fixture for ${category}: ${name}`)
  return product
}
const complete = (): BuilderSelections => ({
  cpu: pick('cpu', '7800X3D'), mobo: pick('mobo', 'B650 Tomahawk'), gpu: pick('gpu'),
  ram: pick('ram'), storage: pick('storage'), psu: pick('psu'), case: pick('case'),
  cooling: pick('cooling'),
})

beforeEach(() => {
  useBuilderStore.setState({ selections: emptyBuilderSelections() })
  useCartStore.setState({ items: [], orders: [], favorites: [], nextOrderId: 1, activeAccountId: null })
})

describe('builder selection and catalog', () => {
  it('covers eight real catalog categories', () => {
    expect(BUILDER_CATEGORIES).toHaveLength(8)
    for (const category of BUILDER_CATEGORIES) {
      expect(getProductsForCategory(category).length).toBeGreaterThan(0)
      expect(getProductsForCategory(category).every((p) => p.category === CATALOG_CATEGORY_MAP[category])).toBe(true)
    }
  })

  it('selects, replaces, removes and clears products; updates total and count', () => {
    const first = pick('cpu', '7600')
    const second = pick('cpu', '7800X3D')
    const store = useBuilderStore.getState()
    store.setProduct('cpu', first)
    expect(store.selectedCount()).toBe(1)
    expect(store.totalPrice()).toBe(first.price)
    store.setProduct('cpu', second)
    expect(store.selectedCount()).toBe(1)
    expect(store.totalPrice()).toBe(second.price)
    store.setProduct('gpu', pick('gpu'))
    expect(store.selectedCount()).toBe(2)
    store.removeProduct('cpu')
    expect(store.selectedCount()).toBe(1)
    store.clearAll()
    expect(store.selectedCount()).toBe(0)
    expect(store.totalPrice()).toBe(0)
  })

  it('rejects assigning a wrong product category to a slot', () => {
    useBuilderStore.getState().setProduct('cpu', pick('gpu'))
    expect(useBuilderStore.getState().selections.cpu).toBeNull()
  })
})

describe('compatibility and calculations', () => {
  it('detects real AM5 / LGA1700 incompatibility', () => {
    const parts = emptyBuilderSelections()
    parts.cpu = pick('cpu', '7800X3D')
    parts.mobo = pick('mobo', 'Z790 AORUS')
    expect(checkBuildCompatibility(parts)).toContainEqual(expect.objectContaining({ label: 'Сокет CPU и платы', status: 'incompatible' }))
  })

  it('detects incompatible RAM technology', () => {
    const parts = emptyBuilderSelections()
    parts.mobo = pick('mobo', 'B650 Tomahawk')
    parts.ram = { ...pick('ram'), name: 'Test DDR4 RAM', type: 'DDR4', specs: ['DDR4', '3200 МГц'] }
    expect(checkBuildCompatibility(parts)).toContainEqual(expect.objectContaining({ label: 'Тип оперативной памяти', status: 'incompatible' }))
  })

  it('does not claim unknown GPU fitment, cooling or PSU sufficiency is compatible', () => {
    const parts = complete()
    const checks = checkBuildCompatibility(parts)
    expect(checks.find((check) => check.label === 'Габариты видеокарты')?.status).toBe('unknown')
    expect(checks.find((check) => check.label === 'Мощность блока питания')?.status).toBe('unknown')
    expect(checks.find((check) => check.label === 'Совместимость охлаждения')?.status).toBe('unknown')
    expect(estimateComponentPower(parts)).toBeNull() // Demo CPU/GPU do not list consumption
  })

  it('rejects a PSU weaker than the explicitly declared CPU and GPU lower bound', () => {
    const parts = complete()
    parts.cpu = { ...parts.cpu!, specs: ['AM5', 'TDP 250W'] }
    parts.gpu = { ...parts.gpu!, specs: ['TGP 500W'] }
    parts.psu = { ...parts.psu!, name: '700W PSU', specs: ['700 Вт'] }
    expect(estimateComponentPower(parts)).toBe(750)
    expect(checkBuildCompatibility(parts)).toContainEqual(expect.objectContaining({ label: 'Мощность блока питания', status: 'incompatible' }))
  })

  it('treats conflicting PSU specification and product name as unknown', () => {
    const parts = complete()
    parts.cpu = { ...parts.cpu!, specs: ['AM5', 'TDP 250W'] }
    parts.gpu = { ...parts.gpu!, specs: ['TGP 500W'] }
    parts.psu = { ...parts.psu!, name: '700W PSU', specs: ['600 Вт'] }
    expect(checkBuildCompatibility(parts)).toContainEqual(expect.objectContaining({ label: 'Мощность блока питания', status: 'unknown' }))
  })

  it('only enables cart for all eight parts with no confirmed conflicts', () => {
    const parts = complete()
    expect(countSelected(parts)).toBe(8)
    expect(calculateBuilderPrice(parts)).toBe(BUILDER_CATEGORIES.reduce((sum, category) => sum + parts[category]!.price, 0))
    expect(isBuildCartEligible(parts)).toBe(true) // Unknown checks must be disclosed, not silently "compatible"
    parts.mobo = pick('mobo', 'Z790 AORUS')
    expect(isBuildCartEligible(parts)).toBe(false)
    parts.mobo = null
    expect(isBuildCartEligible(parts)).toBe(false)
  })

  it('keeps cart snapshot independent and does not double-count nested components', () => {
    const parts = complete()
    const payload = createBuildCartPayload(parts, 999999, '/fallback.jpg')
    expect(payload).not.toBeNull()
    useCartStore.getState().addBuild(payload!)
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useCartStore.getState().totalPrice()).toBe(calculateBuilderPrice(parts))
    expect(useCartStore.getState().items[0]).toMatchObject({ id: 999999, quantity: 1 })
    const first = payload!.components[0].name
    parts.cpu = null
    expect(payload!.components).toHaveLength(8)
    expect(payload!.components[0].name).toBe(first)
    const order = useCartStore.getState().placeOrder()
    expect(order.itemCount).toBe(1)
    expect(order.items).toHaveLength(1)
    expect(order.items[0].components).toHaveLength(8)
    expect(order.total).toBe(payload!.price)
  })

  it('rejects a partial cart payload', () => {
    const parts = emptyBuilderSelections()
    parts.cpu = mockProducts.find((item) => item.category === 'Процессоры')!
    expect(createBuildCartPayload(parts, 8, '/fallback.jpg')).toBeNull()
  })
})
