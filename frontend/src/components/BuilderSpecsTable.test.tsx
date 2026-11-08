import { getProductsForCategory } from '../test-api'
import { describe, expect, it } from 'vitest'
import { emptyBuilderSelections } from '../stores/builderStore'
import { deriveBuilderSpecs } from '../data/builderSpecs'

describe('builder specifications', () => {
  it('shows storage capacity and interface in the proper fields', () => {
    const parts = emptyBuilderSelections()
    parts.storage = getProductsForCategory('storage').find((item) => item.name.includes('Samsung 990 PRO'))!
    const specs = deriveBuilderSpecs(parts)
    expect(specs.find((item) => item.label === 'Объём накопителя')?.value).toContain('1 ТБ')
    expect(specs.find((item) => item.label === 'Интерфейс накопителя')?.value).toContain('PCIe')
  })

  it('does not invent absent wattage or socket information', () => {
    const parts = emptyBuilderSelections()
    parts.cpu = getProductsForCategory('cpu')[0]
    parts.gpu = getProductsForCategory('gpu')[0]
    const specs = deriveBuilderSpecs(parts)
    expect(specs.some((item) => item.label === 'Потребление CPU + GPU (минимум)')).toBe(false)
  })
})
