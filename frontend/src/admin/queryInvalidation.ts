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
export const ADMIN_CATEGORIES_PATH = '/api/v1/admin/categories'

/**
 * Cached category characteristic dictionary, e.g.
 * `/api/v1/admin/categories/7/characteristics`.
 *
 * The path embeds the category id, so it is matched as a whole instead of by a
 * prefix: `/api/v1/admin/categories` alone would also catch unrelated category
 * endpoints. A product write can add a new `dimensions_mm` value to the
 * dictionary, which makes the cached definitions of that category stale.
 */
const CHARACTERISTICS_KEY = new RegExp(
  `^${ADMIN_CATEGORIES_PATH.replace(/[/.]/g, '\\$&')}/(\\d+)/characteristics$`,
)

/**
 * Filter options are derived from the product records themselves, so a product
 * change invalidates them as well. Only review-only changes leave them alone:
 * reviews modify ratings, not colours, manufacturers or product types.
 */
const CATALOG_PATHS_INDEPENDENT_OF_REVIEWS = [`${PUBLIC_CATALOG_PATH}/filters`]

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
 * product detail, public review lists, ratings, search suggestions and the
 * catalog filter options, which are computed from the product records.
 *
 * `categories` narrows the characteristic-dictionary invalidation to the
 * categories the mutation can affect:
 *
 * - omitted → every cached dictionary is invalidated (a product write may create
 *   a `dimensions_mm` value in any category the form touched);
 * - `[]` → no dictionary is touched (image-only mutations never change values);
 * - a list of ids → only those categories, which is what a create/update passes
 *   (the target category, and the previous one during a transition).
 */
export function invalidateAfterProductChange(
  queryClient: QueryClient,
  categories?: readonly (number | null | undefined)[],
): Promise<void[]> {
  return Promise.all([
    invalidatePath(queryClient, ADMIN_PRODUCTS_PATH),
    invalidatePath(queryClient, ADMIN_STATS_PATH),
    invalidatePath(queryClient, PUBLIC_CATALOG_PATH),
    invalidateCharacteristicDefinitions(queryClient, categories),
  ])
}

/**
 * Invalidates the cached category characteristic dictionaries.
 *
 * Without `categoryIds` every cached dictionary is invalidated; an empty list is
 * a no-op. Only the definitions queries are matched, so no public query is
 * cancelled or refetched by this call.
 */
export function invalidateCharacteristicDefinitions(
  queryClient: QueryClient,
  categoryIds?: readonly (number | null | undefined)[],
): Promise<void> {
  if (categoryIds && categoryIds.length === 0) return Promise.resolve()
  const wanted = categoryIds
    ? new Set(
        categoryIds.filter((id): id is number => typeof id === 'number' && id > 0),
      )
    : null
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const path = query.queryKey[0]
      if (typeof path !== 'string') return false
      const match = CHARACTERISTICS_KEY.exec(path)
      if (!match) return false
      return wanted === null || wanted.has(Number(match[1]))
    },
  })
}

/**
 * Reviews affect the admin review queue, the product detail counters, analytics
 * and the public product rating/review list. Available filter options do not
 * depend on reviews, so they keep their cached value.
 */
export function invalidateAfterReviewChange(queryClient: QueryClient): Promise<void[]> {
  return Promise.all([
    invalidatePath(queryClient, ADMIN_REVIEWS_PATH),
    invalidatePath(queryClient, ADMIN_PRODUCTS_PATH),
    invalidatePath(queryClient, ADMIN_STATS_PATH),
    invalidatePath(queryClient, PUBLIC_CATALOG_PATH, { exclude: CATALOG_PATHS_INDEPENDENT_OF_REVIEWS }),
  ])
}
