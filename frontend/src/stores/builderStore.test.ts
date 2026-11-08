import { beforeEach, describe, expect, it } from 'vitest'
import { getProductsForCategory } from '../test-api'
import { useBuilderStore, emptyBuilderSelections, countSelected, calculateBuilderPrice, estimateComponentPower } from './builderStore'

beforeEach(() => useBuilderStore.getState().startNewBuild())
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
  it('estimates power only when both components declare electrical consumption', () => {
    const parts = emptyBuilderSelections()
    parts.cpu = { ...getProductsForCategory('cpu')[0], specs: ['TDP 250W'] }
    expect(estimateComponentPower(parts)).toBeNull()
    parts.gpu = { ...getProductsForCategory('gpu')[0], specs: ['TGP 500W'] }
    expect(estimateComponentPower(parts)).toBe(750)
  })
})
