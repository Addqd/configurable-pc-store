import { describe, expect, it } from 'vitest'
import { calculateRating, getProductDetail } from './productDetails'
import { mockProducts } from './mockProducts'

describe('Product details', () => {
  it('resolves all catalog product slugs and rejects unknown slugs', () => {
    for (const product of mockProducts) {
      const detail = getProductDetail(product.slug)
      expect(detail?.id).toBe(product.id)
      expect(detail?.name).toBe(product.name)
    }
    expect(getProductDetail('not-a-product')).toBeNull()
  })

  it('uses the actual product image once, not five fake placeholder views', () => {
    const product = mockProducts[6]
    expect(getProductDetail(product.slug)?.gallery).toEqual([product.image])
  })

  it('provides no fabricated technical specifications or empty rows', () => {
    for (const product of mockProducts) {
      const detail = getProductDetail(product.slug)!
      expect(detail.detailedSpecs.every((spec) => spec.label.trim() && spec.value.trim())).toBe(true)
      expect(detail.detailedSpecs.length).toBeGreaterThan(0)
    }
    const gpu = getProductDetail('gpu-rtx-4090')!
    expect(gpu.detailedSpecs.some((s) => s.value === '220 Вт' || s.value === '650 Вт')).toBe(false)
    const cpu = getProductDetail('cpu-ryzen-9-7950x')!
    expect(cpu.detailedSpecs.some((s) => s.label === 'TDP' || s.label === 'Кэш L3')).toBe(false)
    expect(getProductDetail('cpu-core-i9-14900kf')?.detailedSpecs).toContainEqual({ label: 'Количество ядер', value: '24 ядра' })
    expect(getProductDetail('mobo-msi-b650-tomahawk')?.detailedSpecs).toContainEqual({ label: 'Чипсет', value: 'B650' })
  })

  it('calculates review stats from actual demo fixtures', () => {
    const product = getProductDetail('gpu-rtx-4070-super')!
    expect(product.reviewCount).toBe(product.reviews.length)
    expect(product.rating).toBe(calculateRating(product.reviews))
    expect(calculateRating([...product.reviews, { id: 99999, author: 'Пользователь', date: '2026-11-02', rating: 1, text: 'Проверка' }])).toBeLessThan(product.rating)
  })
})
