import { QueryClient } from '@tanstack/react-query'
import { isPrivateEndpoint, PRIVATE_QUERY_ROOT_NAMES } from './privateEndpoints'

export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: 1 } } })

/**
 * Generated hooks use the endpoint URL as the first key segment; a few queries
 * created by hand use a short root name instead.
 */
export function isPrivateQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0]
  if (typeof root !== 'string') return false
  return PRIVATE_QUERY_ROOT_NAMES.has(root) || isPrivateEndpoint(root)
}

/**
 * Drop only authenticated data (cart, builds, orders, favorites, own profile)
 * when the session changes. Anonymous visitors and public pages are unaffected:
 * guest browsing is a first-class state, so their queries keep running.
 */
export function clearPrivateQueryCache(): void {
  const predicate = (query: { queryKey: readonly unknown[] }) => isPrivateQueryKey(query.queryKey)
  void queryClient.cancelQueries({ predicate })
  queryClient.removeQueries({ predicate })
}
