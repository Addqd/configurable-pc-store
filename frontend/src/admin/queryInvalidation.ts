import type { QueryClient } from '@tanstack/react-query'

/**
 * Endpoint bases of the generated Orval query keys.
 *
 * Orval builds keys as `[path]` or `[path, params]`, and embeds route ids in the
 * path itself (`/api/v1/admin/products/7`). A key like
 * `['/api/v1/admin/products', 7]` therefore never matches a generated detail
 * key, and `['/api/v1/admin/stats']` never matches `['/api/v1/admin/stats/overview']`.
 * All invalidation below compares the first key element as a path prefix.
 */
export const ADMIN_PRODUCTS_PATH = '/api/v1/admin/products'
export const ADMIN_REVIEWS_PATH = '/api/v1/admin/reviews'
export const ADMIN_STATS_PATH = '/api/v1/admin/stats'
export const ADMIN_USERS_PATH = '/api/v1/admin/users'
export const ADMIN_EVENTS_PATH = '/api/v1/admin/events'
export const PUBLIC_CATALOG_PATH = '/api/v1/products'

/** Filter options do not change when a product or a review is edited. */
const CATALOG_INDEPENDENT_PATHS = [`${PUBLIC_CATALOG_PATH}/filters`]

function matchesPath(queryKey: readonly unknown[], base: string, exclude: readonly string[]): boolean {
  const path = queryKey[0]
  if (typeof path !== 'string') return false
  if (exclude.includes(path)) return false
  return path === base || path.startsWith(`${base}/`)
}

/**
 * Invalidates every cached query whose endpoint path is `base` or nested under
 * it, e.g. the list (`/api/v1/admin/products`) and the detail
 * (`/api/v1/admin/products/7`) together.
 */
export function invalidatePath(
  queryClient: QueryClient,
  base: string,
  options: { exclude?: readonly string[] } = {},
): Promise<void> {
  const exclude = options.exclude ?? []
  return queryClient.invalidateQueries({
    predicate: (query) => matchesPath(query.queryKey, base, exclude),
  })
}

/**
 * Admin product data plus everything the storefront derives from the catalog:
 * product detail, public review lists, ratings and search suggestions.
 */
export function invalidateAfterProductChange(queryClient: QueryClient): Promise<void[]> {
  return Promise.all([
    invalidatePath(queryClient, ADMIN_PRODUCTS_PATH),
    invalidatePath(queryClient, ADMIN_STATS_PATH),
    invalidatePath(queryClient, PUBLIC_CATALOG_PATH, { exclude: CATALOG_INDEPENDENT_PATHS }),
  ])
}

/**
 * Reviews affect the admin review queue, the product detail counters, analytics
 * and the public product rating/review list.
 */
export function invalidateAfterReviewChange(queryClient: QueryClient): Promise<void[]> {
  return Promise.all([
    invalidatePath(queryClient, ADMIN_REVIEWS_PATH),
    invalidatePath(queryClient, ADMIN_PRODUCTS_PATH),
    invalidatePath(queryClient, ADMIN_STATS_PATH),
    invalidatePath(queryClient, PUBLIC_CATALOG_PATH, { exclude: CATALOG_INDEPENDENT_PATHS }),
  ])
}
