import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import { render as appRender } from '../test-utils'
import { mockCatalogFetch } from '../test-api'
import { SearchDropdown } from './SearchDropdown'
import { useUIStore } from '../stores/uiStore'

const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
const suggestion = (id: number, name: string) => ({
  id, slug: `product-${id}`, name, price: '1000.00', cover_image_url: '/placeholder.png',
  category: { id: 1, slug: 'gpu', name: 'Видеокарты', sort_order: 0 },
  manufacturer: { id: 1, slug: 'maker', name: 'Maker' },
})
const suggestionsCalls = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/search/suggestions'))

const type = (value: string) => act(() => { useUIStore.getState().setSearchQuery(value) })

beforeEach(() => { useUIStore.getState().setSearchQuery('') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); useUIStore.getState().setSearchQuery('') })

describe('search suggestions', () => {
  it('makes no request for an empty query', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const view = appRender(<SearchDropdown />)
    expect(view.container.firstChild).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows server suggestions and links to the full search', async () => {
    mockCatalogFetch()
    type('ryzen')
    appRender(<SearchDropdown />)
    expect(await screen.findByText('AMD Ryzen 5 7600')).toBeTruthy()
    expect(screen.getByRole('link', { name: /показать все/i }).getAttribute('href')).toBe('/catalog?q=ryzen')
    expect(suggestionsCalls(vi.mocked(fetch)).length).toBe(1)
  })

  it('distinguishes a failed request from an empty search result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    type('ryzen')
    appRender(<SearchDropdown />)
    expect((await screen.findByRole('alert', {}, { timeout: 4000 })).textContent).toContain('Не удалось загрузить')
  })

  it('collapses rapid typing into one request for the settled term', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/api/v1/products/search/suggestions') return json([suggestion(1, `Result for ${url.searchParams.get('q')}`)])
      return json({ items: [], total: 0, page: 1, page_size: 1, total_pages: 1 })
    })
    vi.stubGlobal('fetch', fetchMock)
    appRender(<SearchDropdown />)

    type('r')
    type('ry')
    type('ryz')
    type('ryzen')

    expect(suggestionsCalls(fetchMock)).toEqual([])
    expect(await screen.findByText('Result for ryzen')).toBeTruthy()
    expect(suggestionsCalls(fetchMock)).toHaveLength(1)
    expect(suggestionsCalls(fetchMock)[0]).toContain('q=ryzen')
  })

  it('does not request suggestions after the query is cleared', async () => {
    const fetchMock = vi.fn(async () => json([]))
    vi.stubGlobal('fetch', fetchMock)
    appRender(<SearchDropdown />)

    type('ryzen')
    type('')

    await new Promise((done) => setTimeout(done, 400))
    expect(suggestionsCalls(fetchMock)).toEqual([])
  })

  it('never lets a slow older response replace newer suggestions', async () => {
    let resolveOld!: (response: Response) => void
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      const term = url.searchParams.get('q')
      if (url.pathname === '/api/v1/products/search/suggestions') {
        if (term === 'ryzen') return new Promise<Response>((done) => { resolveOld = done })
        return json([suggestion(2, 'RTX 4070 result')])
      }
      return json({ items: [], total: 0, page: 1, page_size: 1, total_pages: 1 })
    })
    vi.stubGlobal('fetch', fetchMock)
    appRender(<SearchDropdown />)

    type('ryzen')
    await waitFor(() => expect(suggestionsCalls(fetchMock)).toHaveLength(1))
    type('rtx')
    expect(await screen.findByText('RTX 4070 result')).toBeTruthy()

    act(() => { resolveOld(json([suggestion(1, 'Ryzen older result')])) })
    await waitFor(() => expect(screen.queryByText('Ryzen older result')).toBeNull())
    expect(screen.getByText('RTX 4070 result')).toBeTruthy()
  })
})
