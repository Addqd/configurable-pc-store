import { beforeEach, describe, expect, it } from 'vitest'
import { readProductReviews, writeProductReviews } from './reviewStorage'

beforeEach(() => localStorage.clear())

describe('Demo review storage', () => {
  it('isolates reviews per product', () => {
    const review = { id: 9001, author: 'Пользователь', rating: 2, date: '2026-11-02', text: 'Тестовый отзыв' }
    expect(writeProductReviews('gpu-rtx-4090', [review])).toBe(true)
    expect(readProductReviews('gpu-rtx-4090')).toEqual([review])
    expect(readProductReviews('cpu-ryzen-5-7600')).toEqual([])
  })

  it('rejects malformed user-controlled localStorage data', () => {
    localStorage.setItem('pc-builder-product-reviews:a', '{invalid json')
    expect(readProductReviews('a')).toEqual([])
    localStorage.setItem('pc-builder-product-reviews:a', JSON.stringify([{ text: 'missing fields' }]))
    expect(readProductReviews('a')).toEqual([])
  })
})
