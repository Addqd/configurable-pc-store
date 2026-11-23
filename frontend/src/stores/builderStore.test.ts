import { beforeEach, describe, expect, it } from 'vitest'
import { getProductsForCategory } from '../test-api'
import type { Product } from '../data/product'
import { useBuilderStore, emptyBuilderSelections, countSelected, calculateBuilderPrice, estimateComponentPower } from './builderStore'

beforeEach(() => useBuilderStore.getState().startNewBuild())

/** Replace one structured characteristic on a fixture product. */
const withCharacteristic = (product: Product, code: string, value: unknown): Product => ({
  ...product,
  characteristics: [
    ...(product.characteristics ?? []).filter((item) => item.code !== code),
    { code, name: code, dataType: 'number', value, displayValue: String(value), showInShort: false, showInDetails: false },
  ],
})

const withoutCharacteristic = (product: Product, code: string): Product => ({
  ...product,
  characteristics: (product.characteristics ?? []).filter((item) => item.code !== code),
})

describe('temporary builder draft', () => {
  it('selects, replaces and removes products and totals current prices', () => {
    const [first, second] = getProductsForCategory('cpu')
    useBuilderStore.getState().setProduct('cpu', first)
    expect(countSelected(useBuilderStore.getState().selections)).toBe(1)
    useBuilderStore.getState().setProduct('cpu', second)
    expect(calculateBuilderPrice(useBuilderStore.getState().selections)).toBe(second.price)
    useBuilderStore.getState().removeProduct('cpu')
    expect(countSelected(useBuilderStore.getState().selections)).toBe(0)
  })
  it('rejects assigning a product to the wrong slot', () => {
    useBuilderStore.getState().setProduct('cpu', getProductsForCategory('gpu')[0])
    expect(useBuilderStore.getState().selections.cpu).toBeNull()
  })
  it('estimates power only from declared structured characteristics', () => {
    const parts = emptyBuilderSelections()
    const cpu = getProductsForCategory('cpu')[0]
    const gpu = getProductsForCategory('gpu')[0]

    // A single component is not a power budget.
    parts.cpu = cpu
    expect(estimateComponentPower(parts)).toBeNull()

    // Both declared values are summed: 65 W TDP + 245 W board power.
    parts.gpu = gpu
    expect(estimateComponentPower(parts)).toBe(310)
  })
  it('never fabricates power from display strings or wrong data types', () => {
    const parts = emptyBuilderSelections()
    const cpu = getProductsForCategory('cpu')[0]
    parts.cpu = { ...cpu, specs: ['TDP 250W'] }
    parts.gpu = { ...getProductsForCategory('gpu')[0], specs: ['TGP 500W'] }
    // Display text is not structured evidence.
    expect(estimateComponentPower(parts)).toBe(310)

    parts.cpu = withoutCharacteristic(cpu, 'thermal_design_power_w')
    expect(estimateComponentPower(parts)).toBeNull()

    parts.cpu = withCharacteristic(cpu, 'thermal_design_power_w', '65')
    expect(estimateComponentPower(parts)).toBeNull()
  })
})
