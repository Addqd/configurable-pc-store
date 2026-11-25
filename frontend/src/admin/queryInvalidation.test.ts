import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  invalidateAfterProductChange, invalidateAfterReviewChange, invalidateCharacteristicDefinitions,
  invalidatePath,
} from './queryInvalidation'

/** Seeds cache entries with the exact key shapes Orval generates. */
function seededClient(keys: readonly (readonly unknown[])[]) {
  const client = new QueryClient()
  keys.forEach((key) => client.setQueryData(key, { seeded: true }))
  return client
}

const isInvalidated = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated ?? false

/** Filter queries the admin form and the catalog request with parameters. */
const filterKeys = [
  ['/api/v1/products/filters', {}],
  ['/api/v1/products/filters', { categories: ['gpu'], manufacturers: ['msi'] }],
] as const

/** Category characteristic dictionaries, keyed exactly as Orval generates them. */
const definitionsKey = (categoryId: number) =>
  [`/api/v1/admin/categories/${categoryId}/characteristics`] as const

describe('admin query invalidation', () => {
  it('matches path prefixes, which `[\'/api/v1/admin/products\', id]` never did', async () => {
    const listKey = ['/api/v1/admin/products', { page: 1 }]
    const detailKey = ['/api/v1/admin/products/7']
    const unrelatedKey = ['/api/v1/admin/products-archive']
    const client = seededClient([listKey, detailKey, unrelatedKey])

    await invalidatePath(client, '/api/v1/admin/products')

    expect(isInvalidated(client, listKey)).toBe(true)
    expect(isInvalidated(client, detailKey)).toBe(true)
    expect(isInvalidated(client, unrelatedKey)).toBe(false)
  })

  it('invalidates nested statistics endpoints', async () => {
    const overviewKey = ['/api/v1/admin/stats/overview', { date_from: '2026-06-01' }]
    const productStatsKey = ['/api/v1/admin/stats/products/13', { date_to: '2026-11-20' }]
    const timelineKey = ['/api/v1/admin/stats/timeline', { product_ids: [13] }]
    const reviewsKey = ['/api/v1/admin/reviews', { page: 1 }]
    const client = seededClient([overviewKey, productStatsKey, timelineKey, reviewsKey])

    await invalidateAfterProductChange(client)

    expect(isInvalidated(client, overviewKey)).toBe(true)
    expect(isInvalidated(client, productStatsKey)).toBe(true)
    expect(isInvalidated(client, timelineKey)).toBe(true)
    expect(isInvalidated(client, reviewsKey)).toBe(false)
  })

  it('refreshes public product detail, gallery and review data after a product change', async () => {
    const catalogKey = ['/api/v1/products', { page: 1 }]
    const detailKey = ['/api/v1/products/gpu-rtx-4070-super']
    const imagesKey = ['/api/v1/products/7/images']
    const reviewsKey = ['/api/v1/products/7/reviews', { page: 1 }]
    const suggestionKey = ['/api/v1/products/search-suggestions', { q: 'rtx' }]
    const client = seededClient([catalogKey, detailKey, imagesKey, reviewsKey, suggestionKey])

    await invalidateAfterProductChange(client)

    expect(isInvalidated(client, catalogKey)).toBe(true)
    expect(isInvalidated(client, detailKey)).toBe(true)
    expect(isInvalidated(client, imagesKey)).toBe(true)
    expect(isInvalidated(client, reviewsKey)).toBe(true)
    expect(isInvalidated(client, suggestionKey)).toBe(true)
  })

  it('refreshes the catalog filter options after any product change', async () => {
    // The backend derives colours, manufacturers and product types from the
    // product records, so every product mutation can change the filter options.
    const client = seededClient(filterKeys)

    await invalidateAfterProductChange(client)

    for (const key of filterKeys) expect(isInvalidated(client, key), String(key)).toBe(true)
  })

  it('leaves unrelated private queries untouched', async () => {
    const usersKey = ['/api/v1/admin/users', { page: 1 }]
    const sessionKey = ['/api/v1/auth/me']
    const cartKey = ['/api/v1/cart']
    const client = seededClient([usersKey, sessionKey, cartKey])

    await invalidateAfterProductChange(client)

    expect(isInvalidated(client, usersKey)).toBe(false)
    expect(isInvalidated(client, sessionKey)).toBe(false)
    expect(isInvalidated(client, cartKey)).toBe(false)
  })

  it('refreshes admin reviews, product counters and the public rating after a review change', async () => {
    const adminReviews = ['/api/v1/admin/reviews', { product_id: 7 }]
    const adminProduct = ['/api/v1/admin/products/7']
    const publicReviews = ['/api/v1/products/7/reviews', { page: 1 }]
    const usersKey = ['/api/v1/admin/users', { page: 1 }]
    const client = seededClient([adminReviews, adminProduct, publicReviews, usersKey])

    await invalidateAfterReviewChange(client)

    expect(isInvalidated(client, adminReviews)).toBe(true)
    expect(isInvalidated(client, adminProduct)).toBe(true)
    expect(isInvalidated(client, publicReviews)).toBe(true)
    expect(isInvalidated(client, usersKey)).toBe(false)
  })

  it('keeps the filter options cached when only a review changed', async () => {
    // Reviews change ratings, not the available colours, manufacturers or types.
    const client = seededClient(filterKeys)

    await invalidateAfterReviewChange(client)

    for (const key of filterKeys) expect(isInvalidated(client, key), String(key)).toBe(false)
  })

  it('refreshes the characteristic dictionary of the affected category after a product change', async () => {
    // A new `dimensions_mm` value is created in the dictionary of the written
    // category, so the cached definitions of that category are stale.
    const gpu = definitionsKey(8)
    const cpu = definitionsKey(3)
    const client = seededClient([gpu, cpu])

    await invalidateAfterProductChange(client, [8])

    expect(isInvalidated(client, gpu)).toBe(true)
    expect(isInvalidated(client, cpu)).toBe(false)
  })

  it('covers a category transition by refreshing both categories', async () => {
    const source = definitionsKey(8)
    const target = definitionsKey(9)
    const unrelated = definitionsKey(12)
    const client = seededClient([source, target, unrelated])

    await invalidateAfterProductChange(client, [9, 8])

    expect(isInvalidated(client, source)).toBe(true)
    expect(isInvalidated(client, target)).toBe(true)
    expect(isInvalidated(client, unrelated)).toBe(false)
  })

  it('leaves the dictionaries cached for an image-only mutation', async () => {
    // `[]` is what the form passes when only the gallery changed.
    const client = seededClient([definitionsKey(8)])

    await invalidateAfterProductChange(client, [])

    expect(isInvalidated(client, definitionsKey(8))).toBe(false)
  })

  it('refreshes every dictionary when no category is given', async () => {
    const keys = [definitionsKey(1), definitionsKey(8), definitionsKey(9)]
    const client = seededClient(keys)

    await invalidateCharacteristicDefinitions(client)

    for (const key of keys) expect(isInvalidated(client, key), String(key)).toBe(true)
  })

  it('never treats a category endpoint as a characteristics dictionary', async () => {
    const neighbours = [
      ['/api/v1/admin/categories'],
      ['/api/v1/admin/categories/8'],
      ['/api/v1/admin/categories/8/products'],
      ['/api/v1/admin/products/8/characteristics'],
    ] as const
    const client = seededClient([...neighbours, definitionsKey(8)])

    await invalidateCharacteristicDefinitions(client, [8])

    for (const key of neighbours) expect(isInvalidated(client, key), String(key)).toBe(false)
    expect(isInvalidated(client, definitionsKey(8))).toBe(true)
  })

  it('does not cancel unrelated public queries while invalidating a dictionary', async () => {
    const publicCatalog = ['/api/v1/products', { page: 1 }]
    const client = seededClient([publicCatalog, definitionsKey(8)])

    await invalidateCharacteristicDefinitions(client, [8])

    expect(isInvalidated(client, definitionsKey(8))).toBe(true)
    expect(isInvalidated(client, publicCatalog)).toBe(false)
  })
})
