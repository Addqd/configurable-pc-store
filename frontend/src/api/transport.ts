import type { ZodType } from 'zod'
import { TokenResponse } from './generated/model'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`API request failed (${status})`)
    this.status = status
  }
}

let accessToken: string | null = null
let refreshPromise: Promise<string> | null = null
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

export async function refreshSession(): Promise<string> {
  if (refreshPromise) return refreshPromise
  const version = sessionVersion
  const csrf = csrfToken()
  if (!csrf) { sessionExpired?.(); throw new ApiError(403) }
  const pending = (async () => {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf },
    })
    if (!response.ok) throw new ApiError(response.status)
    const token = TokenResponse.parse(await response.json()).access_token
    if (version !== sessionVersion) throw new ApiError(401)
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
  let response = await send(token)
  if (response.status === 401 && token && !url.startsWith('/api/v1/auth/login') && requestVersion === sessionVersion) {
    const fresh = token !== accessToken && accessToken ? accessToken : await refreshSession()
    if (requestVersion !== sessionVersion) throw new ApiError(401)
    response = await send(fresh)
  }
  if (token && requestVersion !== sessionVersion) throw new ApiError(401)
  if (!response.ok) {
    if (response.status === 401 && token && requestVersion === sessionVersion) sessionExpired?.()
    throw new ApiError(response.status)
  }
  if (response.status === 204 || response.status === 205) return undefined as T
  const contentType = response.headers.get('content-type') ?? ''
  const data: unknown = contentType.includes('json') ? await response.json() : await response.text()
  return (schema ? schema.parse(data) : data) as T
}
