import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { queryClient } from './api/queryClient'
import { setAccessToken } from './api/transport'
import { selectActiveAccount, useAccountStore } from './stores/accountStore'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const product = (id: number, name: string) => ({
  id, slug: `product-${id}`, name, price: '19990.00', short_specs: ['GPU'], color: null,
  graphics_chip_brand: null, on_sale: false, is_active: true, cover_image_url: '/placeholder.png', images: [],
  average_rating: 4.5, review_count: 2,
  category: { id: 1, slug: 'gpu', name: 'Видеокарты', sort_order: 0 },
  product_type: { id: 1, category_id: 1, slug: 'type-gpu', name: 'Видеокарты' },
  manufacturer: { id: 1, slug: 'maker', name: 'Maker' },
})
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 49, total_pages: 1 })
const filters = {
  categories: [{ id: 1, slug: 'gpu', name: 'Видеокарты', sort_order: 0 }],
  types: [], colors: [], manufacturers: [],
}
const user = { id: 12, email: 'person@example.test', username: 'person', display_name: 'Person', avatar_url: null, created_at: '2026-01-01T00:00:00Z' }
const cart = { items: [], item_count: 0, subtotal: '0.00', total: '0.00' }
const catalog = page([product(1, 'GeForce Test GPU')])

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

type Handler = (url: URL, init: RequestInit) => Promise<Response> | Response | undefined

function stubFetch(handler: Handler) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    (await handler(new URL(String(input), 'http://localhost'), init ?? {})) ?? json({ detail: 'Not found' }, 404))
  vi.stubGlobal('fetch', mock)
  return mock
}

const callsTo = (mock: ReturnType<typeof vi.fn>, pathname: string) =>
  mock.mock.calls.filter(([url]) => new URL(String(url), 'http://localhost').pathname === pathname).length

const cartRequest = (url: URL) => url.pathname === '/api/v1/cart'

beforeEach(() => {
  window.history.pushState({}, '', '/catalog')
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
  setAccessToken(null)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  queryClient.clear()
  document.cookie = 'csrf_token=; Max-Age=0; path=/'
})

describe('guest startup and public catalog', () => {
  it('serves the catalog to a visitor without any session cookie and never asks for a session', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.pathname === '/api/v1/products/filters') return json(filters)
      if (url.pathname === '/api/v1/products') return json(catalog)
      if (cartRequest(url)) return json({ detail: 'Authentication required' }, 401)
    })

    render(<App />)

    expect(await screen.findByTestId('catalog-grid')).toBeTruthy()
    expect(screen.getByText('GeForce Test GPU')).toBeTruthy()
    expect(callsTo(fetchMock, '/api/v1/auth/refresh')).toBe(0)
  })

  it('keeps an in-flight catalog request when a stale session cookie is rejected', async () => {
    document.cookie = 'csrf_token=stale; path=/'
    const products = deferred<Response>()
    const refresh = deferred<Response>()
    const fetchMock = stubFetch((url) => {
      if (url.pathname === '/api/v1/products/filters') return json(filters)
      if (url.pathname === '/api/v1/products') return products.promise
      if (url.pathname === '/api/v1/auth/refresh') return refresh.promise
    })

    render(<App />)
    await waitFor(() => expect(callsTo(fetchMock, '/api/v1/auth/refresh')).toBe(1))
    await waitFor(() => expect(callsTo(fetchMock, '/api/v1/products')).toBe(1))

    refresh.resolve(json({ detail: 'CSRF validation failed' }, 403))
    await waitFor(() => expect(selectActiveAccount(useAccountStore.getState())).toBeNull())
    products.resolve(json(catalog))

    expect(await screen.findByTestId('catalog-grid')).toBeTruthy()
    expect(screen.getByText('Найдено 1 товар')).toBeTruthy()
  })

  it('keeps public products when an expired session clears the private cache', async () => {
    document.cookie = 'csrf_token=stale; path=/'
    setAccessToken('expired-access')
    useAccountStore.setState({ accounts: { '12': { account: { id: '12', email: user.email, username: user.username, displayName: 'Person', avatar: '', createdAt: 0 } } }, activeAccountId: '12' })
    queryClient.setQueryData(['/api/v1/builds'], { items: ['private'] })
    const products = deferred<Response>()
    const fetchMock = stubFetch((url) => {
      if (url.pathname === '/api/v1/products/filters') return json(filters)
      if (url.pathname === '/api/v1/products') return products.promise
      if (cartRequest(url)) return json({ detail: 'expired' }, 401)
      if (url.pathname === '/api/v1/auth/refresh') return json({ detail: 'CSRF validation failed' }, 403)
    })

    render(<App />)
    await waitFor(() => expect(selectActiveAccount(useAccountStore.getState())).toBeNull())
    expect(queryClient.getQueryData(['/api/v1/builds'])).toBeUndefined()
    expect(callsTo(fetchMock, '/api/v1/products')).toBe(1)

    products.resolve(json(catalog))
    expect(await screen.findByTestId('catalog-grid')).toBeTruthy()
  })

  it('restores a real session and still renders the public catalog', async () => {
    document.cookie = 'csrf_token=fresh; path=/'
    const fetchMock = stubFetch((url) => {
      if (url.pathname === '/api/v1/products/filters') return json(filters)
      if (url.pathname === '/api/v1/products') return json(catalog)
      if (url.pathname === '/api/v1/auth/refresh') return json({ access_token: 'access', token_type: 'bearer' })
      if (url.pathname === '/api/v1/auth/me') return json(user)
      if (cartRequest(url)) return json(cart)
    })

    render(<App />)

    expect(await screen.findByTestId('catalog-grid')).toBeTruthy()
    await waitFor(() => expect(selectActiveAccount(useAccountStore.getState())?.id).toBe('12'))
    expect(callsTo(fetchMock, '/api/v1/auth/me')).toBe(1)
  })

  it('keeps the catalog after logout and drops private data only', async () => {
    setAccessToken('valid-access')
    useAccountStore.setState({ accounts: { '12': { account: { id: '12', email: user.email, username: user.username, displayName: 'Person', avatar: '', createdAt: 0 } } }, activeAccountId: '12' })
    queryClient.setQueryData(['/api/v1/cart'], { items: ['private'] })
    queryClient.setQueryData(['product-reviews', 1], { items: [] })
    const products = deferred<Response>()
    const fetchMock = stubFetch((url, init) => {
      if (url.pathname === '/api/v1/products/filters') return json(filters)
      if (url.pathname === '/api/v1/products') return products.promise
      if (cartRequest(url) && init.method !== 'POST') return json(cart)
      if (url.pathname === '/api/v1/auth/logout') return json({ detail: 'Logged out' })
    })

    render(<App />)
    await waitFor(() => expect(callsTo(fetchMock, '/api/v1/products')).toBe(1))
    await useAccountStore.getState().logout()

    expect(selectActiveAccount(useAccountStore.getState())).toBeNull()
    expect(queryClient.getQueryData(['/api/v1/cart'])).toBeUndefined()
    // Public data is not the session's property.
    expect(queryClient.getQueryData(['product-reviews', 1])).toEqual({ items: [] })
    const logoutCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/v1/auth/logout'))
    expect(new Headers(logoutCall?.[1]?.headers).get('X-CSRF-Token')).toBeNull()

    products.resolve(json(catalog))
    expect(await screen.findByTestId('catalog-grid')).toBeTruthy()
  })

  it('keeps public data across an account switch and does not carry private data over', async () => {
    const products = deferred<Response>()
    const fetchMock = stubFetch((url, init) => {
      if (url.pathname === '/api/v1/products/filters') return json(filters)
      if (url.pathname === '/api/v1/products') return products.promise
      if (url.pathname === '/api/v1/auth/login') return json({ access_token: 'access', token_type: 'bearer' })
      if (url.pathname === '/api/v1/auth/me') {
        const other = new Headers(init.headers).get('Authorization')
        return json(other === 'Bearer access' ? { ...user, id: 42 } : user)
      }
    })

    render(<App />)
    await waitFor(() => expect(callsTo(fetchMock, '/api/v1/products')).toBe(1))
    queryClient.setQueryData(['/api/v1/cart'], { items: ['account-a'] })

    expect((await useAccountStore.getState().login('person', 'password')).success).toBe(true)
    expect(selectActiveAccount(useAccountStore.getState())?.id).toBe('42')
    expect(queryClient.getQueryData(['/api/v1/cart'])).toBeUndefined()

    products.resolve(json(catalog))
    expect(await screen.findByTestId('catalog-grid')).toBeTruthy()
  })
})
