import { ApiError } from './transport'

/**
 * The only statuses this application renders as a fullscreen error page.
 * A status outside this list keeps the local, page-level handling it already has.
 */
export const ERROR_PAGE_STATUSES = [403, 404, 429, 500, 503] as const

export type ErrorStatus = (typeof ERROR_PAGE_STATUSES)[number]

export function isErrorStatus(status: number): status is ErrorStatus {
  return (ERROR_PAGE_STATUSES as readonly number[]).includes(status)
}

/**
 * Maps a failed request to a fullscreen error status.
 *
 * Only a real HTTP status from the existing transport counts. A network failure
 * (`ApiError` with status 0), a cancelled request or a response that failed its
 * schema is not an HTTP status and must keep its local handling.
 */
export function errorPageStatus(error: unknown): ErrorStatus | null {
  if (!(error instanceof ApiError)) return null
  return isErrorStatus(error.status) ? error.status : null
}

/**
 * One place that knows where the localized copy of a status lives, so the page
 * cannot drift into per-status branches or a second copy of the same strings.
 */
export function errorStatusKey(status: ErrorStatus, field: 'title' | 'description'): string {
  return `error_page.status.${status}.${field}`
}
