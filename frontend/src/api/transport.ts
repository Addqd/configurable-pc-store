import type { ZodType } from 'zod'
import { TokenResponse } from './generated/model'
import { isPrivateEndpoint } from './privateEndpoints'

/** Bounds diagnostics so a server error page can never flood logs or UI. */
const MAX_DETAIL_LENGTH = 300

const isAbortError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'

/** Only JSON `detail` values from the FastAPI contract are kept; HTML/stack traces never are. */
function sanitizeDetail(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim().slice(0, MAX_DETAIL_LENGTH) || undefined
  if (!Array.isArray(value)) return undefined
  const messages = value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const { msg, loc } = item as { msg?: unknown; loc?: unknown }
    if (typeof msg !== 'string') return []
    const path = Array.isArray(loc) ? loc.filter((part) => typeof part === 'string' || typeof part === 'number').join('.') : ''
    return [path ? `${path}: ${msg}` : msg]
  })
  return messages.length ? messages.join('; ').slice(0, MAX_DETAIL_LENGTH) : undefined
}

/** Reads a FastAPI error body without assuming it is valid, JSON, or present. */
async function readErrorDetail(response: Response): Promise<string | undefined> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) return undefined
  try {
    const raw = await response.text()
    if (!raw.trim()) return undefined
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && 'detail' in parsed
      ? sanitizeDetail((parsed as { detail: unknown }).detail)
      : undefined
  } catch {
    // Malformed JSON and already-consumed bodies keep the status as the only fact.
    return undefined
  }
}

export interface ApiErrorContext {
  method?: string
  /** Request path without the query string, so user input is never recorded. */
  path?: string
  detail?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly method?: string
  readonly path?: string
  readonly detail?: string

  constructor(status: number, context: ApiErrorContext = {}) {
    const target = context.method && context.path ? ` for ${context.method} ${context.path}` : ''
    const reason = context.detail ? `: ${context.detail}` : ''
    super(`API request failed (${status})${target}${reason}`)
    this.name = 'ApiError'
    this.status = status
    this.method = context.method
    this.path = context.path
    this.detail = context.detail
  }
}

let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null
let sessionVersion = 0
let sessionExpired: (() => void) | null = null

export function onSessionExpired(handler: () => void) { sessionExpired = handler }

export function setAccessToken(token: string | null) {
  sessionVersion += 1
  accessToken = token
}

/** Wait until an older refresh has settled before issuing a new login. */
export async function waitForRefresh(): Promise<void> {
  const pending = refreshPromise
  if (pending) { try { await pending } catch { /* A cancelled session must not block a new one. */ } }
}

function csrfToken(): string | undefined {
  const cookie = document.cookie.split('; ').find((part) => part.startsWith('csrf_token='))
  return cookie ? decodeURIComponent(cookie.slice('csrf_token='.length)) : undefined
}

/**
 * Restores an access token from the refresh cookie.
 *
 * `null` means the browser has no session cookies at all: that is a valid guest
 * state, not an expired session, so no request is made and no cache is touched.
 */
export async function refreshSession(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  const version = sessionVersion
  const csrf = csrfToken()
  if (!csrf) return null
  const pending = (async () => {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf },
    })
    if (!response.ok) throw new ApiError(response.status, { method: 'POST', path: '/api/v1/auth/refresh', detail: await readErrorDetail(response) })
    const token = TokenResponse.parse(await response.json()).access_token
    if (version !== sessionVersion) throw new ApiError(401, { method: 'POST', path: '/api/v1/auth/refresh' })
    accessToken = token
    return token
  })()
  refreshPromise = pending
  try { return await pending }
  catch (error) {
    if (version === sessionVersion && error instanceof ApiError && (error.status === 401 || error.status === 403)) sessionExpired?.()
    throw error
  } finally { if (refreshPromise === pending) refreshPromise = null }
}

export async function apiFetch<T>(url: string, options: RequestInit & { schema?: ZodType }): Promise<T> {
  const { schema, ...init } = options
  const method = (init.method ?? 'GET').toUpperCase()
  const path = url.split('?')[0]
  // Only authenticated responses are tied to one session; public catalog data is
  // not, so a session change must not invalidate a public request in flight.
  const sessionScoped = isPrivateEndpoint(path)
  const requestVersion = sessionVersion
  const token = accessToken
  const send = (bearer: string | null) => {
    const headers = new Headers(init.headers)
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`)
    if (url === '/api/v1/auth/logout') {
      const csrf = csrfToken()
      if (csrf) headers.set('X-CSRF-Token', csrf)
    }
    return fetch(url, { ...init, headers, credentials: 'same-origin' })
  }
  const request = async (bearer: string | null) => {
    try { return await send(bearer) }
    catch (error) {
      // Request cancellation must stay a cancellation, not become an API failure.
      if (isAbortError(error)) throw error
      throw new ApiError(0, { method, path, detail: 'network request failed' })
    }
  }
  let response = await request(token)
  if (response.status === 401 && token && !url.startsWith('/api/v1/auth/login') && requestVersion === sessionVersion) {
    const fresh = token !== accessToken && accessToken ? accessToken : await refreshSession()
    if (sessionScoped && requestVersion !== sessionVersion) throw new ApiError(401, { method, path })
    if (!fresh) {
      // The access token is unusable and the refresh cookie is gone: the session ended.
      sessionExpired?.()
      throw new ApiError(401, { method, path })
    }
    response = await request(fresh)
  }
  if (sessionScoped && token && requestVersion !== sessionVersion) throw new ApiError(401, { method, path })
  if (!response.ok) {
    if (response.status === 401 && token && requestVersion === sessionVersion) sessionExpired?.()
    throw new ApiError(response.status, { method, path, detail: await readErrorDetail(response) })
  }
  if (response.status === 204 || response.status === 205) return undefined as T
  const contentType = response.headers.get('content-type') ?? ''
  const data: unknown = contentType.includes('json') ? await response.json() : await response.text()
  return (schema ? schema.parse(data) : data) as T
}
