import { afterEach, describe, expect, it } from 'vitest'
import { isPrivateEndpoint } from './privateEndpoints'
import { clearPrivateQueryCache, isPrivateQueryKey, queryClient } from './queryClient'

afterEach(() => queryClient.clear())

describe('admin endpoints are session-scoped', () => {
  it('marks every admin path as private', () => {
    expect(isPrivateEndpoint('/api/v1/admin')).toBe(true)
    expect(isPrivateEndpoint('/api/v1/admin/products')).toBe(true)
    expect(isPrivateEndpoint('/api/v1/admin/users/1')).toBe(true)
    expect(isPrivateEndpoint('/api/v1/admin/stats/overview')).toBe(true)
    expect(isPrivateEndpoint('/api/v1/admin/events')).toBe(true)
  })

  it('keeps public catalog data out of the private set', () => {
    expect(isPrivateEndpoint('/api/v1/products')).toBe(false)
    expect(isPrivateEndpoint('/api/v1/products/filters')).toBe(false)
    expect(isPrivateEndpoint('/api/v1/adminx')).toBe(false)
  })

  it('drops cached admin data when the session changes but keeps public data', () => {
    queryClient.setQueryData(['/api/v1/admin/products', { page: 1 }], { items: ['admin secret'] })
    queryClient.setQueryData(['/api/v1/products', { page: 1 }], { items: ['public'] })
    expect(isPrivateQueryKey(['/api/v1/admin/products'])).toBe(true)
    expect(isPrivateQueryKey(['/api/v1/products'])).toBe(false)

    clearPrivateQueryCache()

    expect(queryClient.getQueryData(['/api/v1/admin/products', { page: 1 }])).toBeUndefined()
    expect(queryClient.getQueryData(['/api/v1/products', { page: 1 }])).toEqual({ items: ['public'] })
  })
})
