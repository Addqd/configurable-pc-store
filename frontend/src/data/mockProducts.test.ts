import { describe, expect, it } from 'vitest'
import { filterProducts, mockProducts } from './mockProducts'

describe('Mock catalog', () => {
  it('has 24 uniquely identified products: six per currently implemented category', () => {
    expect(mockProducts).toHaveLength(24)
    expect(new Set(mockProducts.map((p) => p.id)).size).toBe(24)
    expect(new Set(mockProducts.map((p) => p.slug)).size).toBe(24)
    for (const category of ['Готовые сборки', 'Видеокарты', 'Процессоры', 'Материнские платы']) {
      expect(mockProducts.filter((p) => p.category === category)).toHaveLength(6)
    }
    for (const product of mockProducts) {
      expect(product.name).toBeTruthy()
      expect(product.manufacturer).toBeTruthy()
      expect(product.image).toBeTruthy()
      expect(product.specs.length).toBeGreaterThan(0)
      expect(product.price).toBeGreaterThan(0)
    }
  })

  it('keeps the AM4 Ryzen 5700X demo build on DDR4 rather than DDR5', () => {
    const powerPlay = mockProducts.find((p) => p.slug === 'gaming-pc-powerplay')!
    expect(powerPlay.specs).toContain('16 ГБ DDR4')
    expect(powerPlay.specs).not.toContain('16 ГБ DDR5')
  })
})

describe('filterProducts', () => {
  it('returns [] for empty or whitespace-only search', () => {
    expect(filterProducts('')).toEqual([])
    expect(filterProducts('   ')).toEqual([])
  })

  it('searches product names and specifications', () => {
    expect(filterProducts('rtx').some((p) => p.slug === 'gpu-rtx-4090')).toBe(true)
    expect(filterProducts('AM5').some((p) => p.slug === 'cpu-ryzen-5-7600')).toBe(true)
  })

  it('searches the graphics chip maker independently from the card vendor', () => {
    const nvidia = filterProducts('nvidia')
    expect(nvidia.map((p) => p.id)).toEqual(expect.arrayContaining([7, 8, 9, 12]))
    const amd = filterProducts('amd')
    expect(amd.map((p) => p.id)).toEqual(expect.arrayContaining([10, 11]))
    expect(filterProducts('msi').some((p) => p.id === 7)).toBe(true)
  })

  it('trims queries, ignores case and returns [] for unmatched terms', () => {
    expect(filterProducts('  GEFORCE  ').some((p) => p.id === 7)).toBe(true)
    expect(filterProducts('xyznonexistent')).toEqual([])
  })
})
