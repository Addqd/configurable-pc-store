import { describe, it, expect } from 'vitest'
import { mockProducts, filterProducts } from './mockProducts'

describe('Mock data', () => {
  it('has 24 products', () => {
    expect(mockProducts.length).toBe(24)
  })

  it('has 6 prebuilts', () => {
    expect(mockProducts.filter(p => p.category === 'Готовые сборки').length).toBe(6)
  })

  it('has 6 GPUs', () => {
    expect(mockProducts.filter(p => p.category === 'Видеокарты').length).toBe(6)
  })

  it('has 6 CPUs', () => {
    expect(mockProducts.filter(p => p.category === 'Процессоры').length).toBe(6)
  })

  it('has 6 motherboards', () => {
    expect(mockProducts.filter(p => p.category === 'Материнские платы').length).toBe(6)
  })

  it('all products have required fields', () => {
    mockProducts.forEach(p => {
      expect(p.id).toBeDefined()
      expect(p.name).toBeDefined()
      expect(p.category).toBeDefined()
      expect(p.manufacturer).toBeDefined()
      expect(p.specs).toBeDefined()
      expect(p.price).toBeDefined()
      expect(p.slug).toBeDefined()
      expect(p.name).not.toBe('')
      expect(p.price).toBeGreaterThan(0)
    })
  })
})

describe('filterProducts', () => {
  it('returns empty for empty query', () => {
    expect(filterProducts('')).toEqual([])
    expect(filterProducts('   ')).toEqual([])
  })

  it('filters by product name', () => {
    const results = filterProducts('rtx')
    expect(results.length).toBeGreaterThan(0)
    results.forEach(r => {
      const nameMatch = r.name.toLowerCase().includes('rtx')
      const specMatch = r.specs.some(s => s.toLowerCase().includes('rtx'))
      expect(nameMatch || specMatch).toBe(true)
    })
  })

  it('filters by category', () => {
    const results = filterProducts('видео')
    expect(results.length).toBeGreaterThan(0)
  })

  it('filters by manufacturer', () => {
    const results = filterProducts('nvidia')
    expect(results.length).toBeGreaterThan(0)
    results.forEach(r => {
      expect(r.manufacturer.toLowerCase()).toContain('nvidia')
    })
  })

  it('filters by specs', () => {
    const results = filterProducts('amd')
    expect(results.length).toBeGreaterThan(0)
  })

  it('returns empty for no match', () => {
    const results = filterProducts('xyznonexistent')
    expect(results.length).toBe(0)
  })
})
