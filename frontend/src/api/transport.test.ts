import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { apiFetch, ApiError, setAccessToken } from './transport'

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
    const request = apiFetch('/api/v1/private', {})
    setAccessToken('account-b')
    finish(new Response('{"private":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    await expect(request).rejects.toMatchObject({ status: 401 })
  })
})
