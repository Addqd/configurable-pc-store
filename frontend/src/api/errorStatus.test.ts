import { describe, expect, it } from 'vitest'
import { ApiError } from './transport'
import { ERROR_PAGE_STATUSES, errorPageStatus, errorStatusKey, isErrorStatus, primaryQueryErrorStatus } from './errorStatus'

describe('fullscreen error status classification', () => {
  it('accepts exactly the five approved statuses', () => {
    expect([...ERROR_PAGE_STATUSES]).toEqual([403, 404, 429, 500, 503])
    for (const status of ERROR_PAGE_STATUSES) {
      expect(isErrorStatus(status)).toBe(true)
      expect(errorPageStatus(new ApiError(status))).toBe(status)
    }
  })

  it.each([0, 400, 401, 408, 409, 422, 418, 502, 504])('keeps %i out of the fullscreen page', (status) => {
    expect(isErrorStatus(status)).toBe(false)
    expect(errorPageStatus(new ApiError(status))).toBeNull()
  })

  it('never turns a non-HTTP failure into a status', () => {
    // A network failure carries status 0, a cancellation is not an ApiError at all,
    // and a schema failure is a plain ZodError: none of them is an HTTP status.
    expect(errorPageStatus(new ApiError(0, { detail: 'network request failed' }))).toBeNull()
    expect(errorPageStatus(new Error('The operation was aborted'))).toBeNull()
    expect(errorPageStatus(Object.assign(new Error('invalid_type'), { name: 'ZodError' }))).toBeNull()
    expect(errorPageStatus(undefined)).toBeNull()
    expect(errorPageStatus('404')).toBeNull()
  })

  it('centralizes the localized key of every status', () => {
    expect(errorStatusKey(404, 'title')).toBe('error_page.status.404.title')
    expect(errorStatusKey(503, 'description')).toBe('error_page.status.503.description')
  })
})

describe('page-critical query classification', () => {
  it.each(ERROR_PAGE_STATUSES)('classifies a failed request with no data as %i', (status) => {
    expect(primaryQueryErrorStatus({ isError: true, data: undefined, error: new ApiError(status) })).toBe(status)
  })

  it('never replaces a page that still has data', () => {
    // A failed background refetch keeps the last successful data (TanStack Query), and
    // that data still has to render.
    expect(primaryQueryErrorStatus({ isError: true, data: [], error: new ApiError(503) })).toBeNull()
    expect(primaryQueryErrorStatus({ isError: true, data: { items: [] }, error: new ApiError(500) })).toBeNull()
  })

  it('ignores a request that has not failed', () => {
    expect(primaryQueryErrorStatus({ isError: false, data: undefined, error: null })).toBeNull()
    expect(primaryQueryErrorStatus({ isError: false, data: [], error: null })).toBeNull()
  })

  it('keeps a failure outside the approved list local', () => {
    expect(primaryQueryErrorStatus({ isError: true, data: undefined, error: new ApiError(401) })).toBeNull()
    expect(primaryQueryErrorStatus({ isError: true, data: undefined, error: new ApiError(422) })).toBeNull()
    expect(primaryQueryErrorStatus({ isError: true, data: undefined, error: new ApiError(0) })).toBeNull()
    expect(primaryQueryErrorStatus({ isError: true, data: undefined, error: new Error('The operation was aborted') })).toBeNull()
  })
})
