import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiFetch, ApiError, onSessionExpired, refreshSession, setAccessToken } from './transport'

describe('API transport', () => {
  beforeEach(() => {
    setAccessToken(null)
    document.cookie = 'csrf_token=test-csrf; path=/'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = 'csrf_token=; Max-Age=0; path=/'
  })

  it('validates successful responses and rejects HTTP failures', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(apiFetch('/api/v1/example', { schema: z.object({ value: z.string() }) })).resolves.toEqual({ value: 'ok' })
    await expect(apiFetch('/api/v1/example', {})).rejects.toMatchObject({ status: 403 })
  })

  it('shares one refresh between simultaneous unauthorized requests and retries once', async () => {
    setAccessToken('old')
    let refreshes = 0
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/refresh')) {
        refreshes += 1
        expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('test-csrf')
        return new Response(JSON.stringify({ access_token: 'new', token_type: 'bearer' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      const auth = new Headers(init.headers).get('Authorization')
      return auth === 'Bearer old'
        ? new Response(null, { status: 401 })
        : new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(Promise.all([apiFetch('/api/v1/private', {}), apiFetch('/api/v1/private', {})])).resolves.toEqual([{ ok: true }, { ok: true }])
    expect(refreshes).toBe(1)
  })

  it('does not retry a request indefinitely after refresh', async () => {
    setAccessToken('old')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/refresh')
      ? new Response(JSON.stringify({ access_token: 'new', token_type: 'bearer' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(null, { status: 401 })))
    await expect(apiFetch('/api/v1/private', {})).rejects.toBeInstanceOf(ApiError)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3)
  })

  it('rejects invalid successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"value":42}', {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))
    await expect(apiFetch('/api/v1/example', { schema: z.object({ value: z.string() }) })).rejects.toThrow()
  })

  it('rejects a previous account response after the session changes', async () => {
    setAccessToken('account-a')
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve })))
    const request = apiFetch('/api/v1/cart', {})
    setAccessToken('account-b')
    finish(new Response('{"private":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    await expect(request).rejects.toMatchObject({ status: 401 })
  })

  it('keeps a public response when the session changes while it is in flight', async () => {
    setAccessToken('account-a')
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve })))
    const request = apiFetch('/api/v1/products', {})
    setAccessToken('account-b')
    finish(new Response('{"public":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    await expect(request).resolves.toEqual({ public: true })
  })
})

describe('API error diagnostics', () => {
  beforeEach(() => {
    setAccessToken(null)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  const respond = (body: BodyInit | null, init: ResponseInit) => new Response(body, init)

  it.each([
    [401, '{"detail":"Authentication required"}', 'Authentication required'],
    [403, '{"detail":"CSRF validation failed"}', 'CSRF validation failed'],
    [404, '{"detail":"Product not found"}', 'Product not found'],
    [422, '{"detail":[{"loc":["body","email"],"msg":"field required","type":"missing"}]}', 'body.email: field required'],
    [500, '{"detail":"Internal error"}', 'Internal error'],
  ])('keeps the status and reads the FastAPI detail for %i', async (status, body, detail) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(body, { status, headers: { 'Content-Type': 'application/json' } })))
    const error = await apiFetch('/api/v1/products?q=secret-query', { method: 'POST' }).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.status).toBe(status)
    expect(apiError.method).toBe('POST')
    expect(apiError.path).toBe('/api/v1/products')
    expect(apiError.detail).toBe(detail)
    // Diagnostics never contain the query string (user input) or credentials.
    expect(apiError.message).not.toContain('secret-query')
  })

  it('reports the status for an empty error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(null, { status: 500 })))
    await expect(apiFetch('/api/v1/products', {})).rejects.toMatchObject({ status: 500, detail: undefined })
  })

  it('reports the status for malformed JSON without leaking the raw body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond('{"detail": broken', { status: 500, headers: { 'Content-Type': 'application/json' } })))
    const error = await apiFetch('/api/v1/products', {}).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ status: 500, detail: undefined })
    expect((error as ApiError).message).not.toContain('broken')
  })

  it('reports the status for a non-JSON error page without copying the page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond('<html><body>Traceback: secret stack</body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } })))
    const error = await apiFetch('/api/v1/products', {}).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ status: 502, detail: undefined })
    expect((error as ApiError).message).not.toContain('Traceback')
  })

  it('converts a network failure into an API error without exposing the URL query', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const error = await apiFetch('/api/v1/products?q=secret-query', {}).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(0)
    expect((error as ApiError).path).toBe('/api/v1/products')
    expect((error as ApiError).message).not.toContain('secret-query')
  })

  it('keeps request cancellation as a cancellation, not an API failure', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))
    await expect(apiFetch('/api/v1/products', {})).rejects.toBe(abort)
  })

  it('does not send a refresh request when there is no session cookie', async () => {
    document.cookie = 'csrf_token=; Max-Age=0; path=/'
    const fetchMock = vi.fn().mockResolvedValue(respond(JSON.stringify({ access_token: 'x', token_type: 'bearer' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(refreshSession()).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats a rejected refresh as an ended session', async () => {
    document.cookie = 'csrf_token=stale; path=/'
    const expired = vi.fn()
    onSessionExpired(expired)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(JSON.stringify({ detail: 'CSRF validation failed' }), { status: 403, headers: { 'Content-Type': 'application/json' } })))
    await expect(refreshSession()).rejects.toMatchObject({ status: 403 })
    expect(expired).toHaveBeenCalledTimes(1)
    onSessionExpired(() => {})
  })
})
