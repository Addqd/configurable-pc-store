/**
 * API paths whose response belongs to the signed-in user.
 *
 * Used in two places that must agree: cache cleanup on a session change
 * (`queryClient.ts`) and the stale-session guard in the transport. Public
 * catalog paths are deliberately absent, so an unrelated session change can
 * never invalidate a public request or its cached data.
 */
const PRIVATE_ENDPOINT_PATTERNS: readonly RegExp[] = [
  /^\/api\/v1\/auth\/(?:me|profile|password|logout|delete)$/,
  /^\/api\/v1\/profile$/,
  /^\/api\/v1\/cart(?:\/|$)/,
  /^\/api\/v1\/builds(?:\/|$)/,
  /^\/api\/v1\/favorites(?:\/|$)/,
  /^\/api\/v1\/admin(?:\/|$)/,
  /^\/api\/v1\/products\/[^/]+\/(?:is-favorited|reviews\/my)$/,
]

export function isPrivateEndpoint(path: string): boolean {
  return PRIVATE_ENDPOINT_PATTERNS.some(pattern => pattern.test(path))
}

/** Root names of hand-written queries that hold authenticated data. */
export const PRIVATE_QUERY_ROOT_NAMES: ReadonlySet<string> = new Set(['my-review', 'favorite'])
