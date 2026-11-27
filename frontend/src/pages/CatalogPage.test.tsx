import { useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, within, waitFor } from '@testing-library/react'
import { createTestQueryClient, render } from '../test-utils'
import { mockCatalogFetch } from '../test-api'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { CatalogPage } from './CatalogPage'

vi.mock('../components/Header', () => ({ Header: () => <div /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div /> }))
vi.mock('../components/CatalogProductCard', () => ({ CatalogProductCard: ({ product }: { product: { name: string; category: string; shortSpecs?: string[] } }) => <article>{product.category}: {product.name}<span>{product.shortSpecs?.join(' · ')}</span></article> }))
const setup = (path = '/catalog') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/catalog" element={<CatalogPage />} /></Routes></MemoryRouter>)
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
/** Stands in for a header/hamburger link changing the catalogue URL while the drawer is open. */
function Navigator() {
  const navigate = useNavigate()
  return <>
    <button type="button" onClick={() => navigate('/catalog?category=cpu')}>перейти к процессорам</button>
    <button type="button" onClick={() => navigate(-1)}>назад</button>
    <button type="button" onClick={() => navigate(1)}>вперёд</button>
  </>
}
const setupWithNavigate = (path = '/catalog') => render(
  <MemoryRouter initialEntries={[path]}>
    <Navigator />
    <Routes><Route path="/catalog" element={<CatalogPage />} /></Routes>
  </MemoryRouter>,
)
beforeEach(() => mockCatalogFetch())
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

/** The product list is the only cache entry whose first key part is exactly this path. */
const productsQueryOf = (client: QueryClient) =>
  client.getQueryCache().findAll({ predicate: (query) => String(query.queryKey[0]) === '/api/v1/products' })[0]

/** A parent state change forces a fresh render, so no assertion can read a stale render. */
function RerenderButton() {
  const [, setTick] = useState(0)
  return <button type="button" onClick={() => setTick((tick) => tick + 1)}>перерисовать</button>
}

const renderCatalog = (client: QueryClient) => render(
  <MemoryRouter initialEntries={['/catalog']}>
    <Routes><Route path="/catalog" element={<><RerenderButton /><CatalogPage /></>} /></Routes>
  </MemoryRouter>,
  { client },
)

describe('server catalog', () => {
  it('fetches a page and fetches the next page after navigation', async () => {
    setup()
    expect(within(await screen.findByTestId('catalog-grid')).getAllByRole('article')).toHaveLength(49)
    fireEvent.click(screen.getByRole('link', { name: 'Страница 2' }))
    await waitFor(() => expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article')).toHaveLength(2))
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true)
  })
  it('sends a selected category to the backend and displays its response', async () => {
    setup('/catalog?category=gpu')
    const cards = within(await screen.findByTestId('catalog-grid')).getAllByRole('article')
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every(card => card.textContent?.includes('Видеокарты'))).toBe(true)
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('categories=gpu'))).toBe(true)
  })
  it('passes server-provided short specifications to product cards', async () => {
    setup('/catalog?category=cpu')
    const cards = within(await screen.findByTestId('catalog-grid')).getAllByRole('article')
    expect(cards.some(card => /ядер|поток|ГГц/i.test(card.textContent ?? ''))).toBe(true)
  })
  it('opens filters and applies a new category', async () => {
    setup()
    await screen.findByTestId('catalog-grid')
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    const dialog = await screen.findByRole('dialog', { name: 'Фильтры' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Процессоры' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Применить' }))
    await waitFor(() => expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article').every(card => card.textContent?.includes('Процессоры'))).toBe(true))
  })
  it('replaces the whole catalogue with the fullscreen page when the product list fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    const { container } = setup()
    expect(await screen.findByText('503')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Приносим извинения')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Сервис временно недоступен')
    // Nothing of the catalogue survives the replacement: no grid, no filters, no alert.
    expect(screen.queryByTestId('catalog-grid')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Фильтры' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(container.querySelector('.pc-error-page')).not.toBeNull()
  })

  it.each([403, 404, 429, 500, 503])('renders the fullscreen page for a failed product list with %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
    setup()
    expect(await screen.findByText(String(status))).toBeTruthy()
    expect(screen.queryByTestId('catalog-grid')).toBeNull()
  })

  it('keeps a status outside the approved list local', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 422 })))
    setup()
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some(node => node.textContent?.includes('Не удалось загрузить'))).toBe(true)
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })

  it('keeps a network failure local', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    setup()

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThan(0)
    // A failure without an HTTP status is not one of the five approved statuses.
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })

  it('treats a successful empty page as valid data', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/api/v1/products/filters') {
        return new Response(JSON.stringify({ categories: [], types: [], colors: [], manufacturers: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 49, total_pages: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    setup()

    expect(await screen.findByRole('heading', { name: 'Ничего не найдено' })).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })

  it('keeps the products when a background refetch fails', async () => {
    let failing = false
    let productRequests = 0
    const base = mockCatalogFetch()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/api/v1/products') {
        productRequests += 1
        if (failing) return new Response(JSON.stringify({ detail: 'boom' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
      }
      return base(input)
    }))
    const client = createTestQueryClient()
    renderCatalog(client)

    // 1. A real successful first response.
    const firstCards = within(await screen.findByTestId('catalog-grid')).getAllByRole('article')
    expect(firstCards.length).toBeGreaterThan(0)
    const firstNames = firstCards.map(card => card.textContent)
    const requestsAfterFirstLoad = productRequests
    expect(requestsAfterFirstLoad).toBeGreaterThan(0)

    // 2. A real background refetch that really fails.
    failing = true
    await act(async () => { await client.invalidateQueries() })
    await waitFor(() => expect(productsQueryOf(client)?.state.status).toBe('error'))

    // 3. The refetch ran, failed, and kept the previous response in the cache.
    expect(productRequests).toBeGreaterThan(requestsAfterFirstLoad)
    const query = productsQueryOf(client)!
    expect(query.state.error).toBeTruthy()
    expect(query.state.data).toBeDefined()
    expect(query.state.dataUpdateCount).toBe(1)
    expect(query.state.errorUpdateCount).toBe(1)

    // 4. A fresh render of that error state still shows the retained page.
    fireEvent.click(screen.getByRole('button', { name: 'перерисовать' }))
    const keptCards = within(screen.getByTestId('catalog-grid')).getAllByRole('article')
    expect(keptCards.map(card => card.textContent)).toEqual(firstNames)
    expect(screen.getByText(/^Найдено/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Страница 2' })).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
    expect(screen.queryByText('Не удалось загрузить данные. Попробуйте ещё раз.')).toBeNull()
  })

  it('keeps a retained empty result when a background refetch fails', async () => {
    let failing = false
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/api/v1/products/filters') {
        return new Response(JSON.stringify({ categories: [], types: [], colors: [], manufacturers: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (failing) return new Response(JSON.stringify({ detail: 'boom' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ items: [], total: 0, page: 1, page_size: 49, total_pages: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    const client = createTestQueryClient()
    renderCatalog(client)

    expect(await screen.findByRole('heading', { name: 'Ничего не найдено' })).toBeTruthy()

    failing = true
    await act(async () => { await client.invalidateQueries() })
    await waitFor(() => expect(productsQueryOf(client)?.state.status).toBe('error'))
    expect(productsQueryOf(client)?.state.data).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'перерисовать' }))
    // An empty successful answer stays valid data after the failure: the page keeps
    // saying "nothing found" instead of claiming a load error.
    expect(screen.getByRole('heading', { name: 'Ничего не найдено' })).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
    expect(screen.queryByText('Не удалось загрузить данные. Попробуйте ещё раз.')).toBeNull()
  })

  it('restores the catalogue after a later successful request', async () => {
    let failing = false
    const base = mockCatalogFetch()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      if (failing && url.pathname === '/api/v1/products') {
        return new Response(JSON.stringify({ detail: 'boom' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
      }
      return base(input)
    }))
    const client = createTestQueryClient()
    renderCatalog(client)
    expect(within(await screen.findByTestId('catalog-grid')).getAllByRole('article').length).toBeGreaterThan(0)

    failing = true
    await act(async () => { await client.invalidateQueries() })
    await waitFor(() => expect(productsQueryOf(client)?.state.status).toBe('error'))

    failing = false
    await act(async () => { await client.refetchQueries({ queryKey: productsQueryOf(client)!.queryKey }) })
    await waitFor(() => expect(productsQueryOf(client)?.state.status).toBe('success'))

    fireEvent.click(screen.getByRole('button', { name: 'перерисовать' }))
    expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article').length).toBeGreaterThan(0)
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })
})

describe('catalog resilience', () => {
  it('keeps products visible when the filter endpoint fails', async () => {
    const base = mockCatalogFetch()
    const failing = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/api/v1/products/filters') {
        return new Response(JSON.stringify({ detail: 'boom' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }
      return base(input)
    })
    vi.stubGlobal('fetch', failing)

    setup('/catalog?category=gpu&sort=price_asc')

    const grid = await screen.findByTestId('catalog-grid')
    expect(within(grid).getAllByRole('article').length).toBeGreaterThan(0)
    expect((await screen.findByRole('alert')).textContent).toContain('Фильтры недоступны')
    // A failed filter request never replaces a working catalogue with an error page.
    expect(screen.queryByText('Приносим извинения')).toBeNull()

    // The active category and sorting survive a failed filter request.
    const productCall = failing.mock.calls.map(([url]) => String(url)).find((url) => url.startsWith('/api/v1/products?'))
    expect(productCall).toContain('categories=gpu')
    expect(productCall).toContain('sort=price_asc')
  })
})

describe('catalog filter drawer and URL synchronization', () => {
  it('closes the drawer when the URL changes and rehydrates it from the new destination', async () => {
    setupWithNavigate()
    await screen.findByTestId('catalog-grid')

    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    const dialog = await screen.findByRole('dialog', { name: 'Фильтры' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Процессоры' }))
    expect((within(dialog).getByRole('checkbox', { name: 'Процессоры' }) as HTMLInputElement).checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'перейти к процессорам' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Фильтры' })).toBeNull())
    await waitFor(() => expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article')
      .every(card => card.textContent?.includes('Процессоры'))).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    const reopened = await screen.findByRole('dialog', { name: 'Фильтры' })
    // The unsaved edit was discarded; the draft comes from the new URL.
    expect((within(reopened).getByRole('checkbox', { name: 'Процессоры' }) as HTMLInputElement).checked).toBe(true)
    expect((within(reopened).getByRole('checkbox', { name: 'Видеокарты' }) as HTMLInputElement).checked).toBe(false)
  })

  it('restores the previous catalogue state on browser Back with the drawer closed', async () => {
    setupWithNavigate()
    expect(within(await screen.findByTestId('catalog-grid')).getAllByRole('article')).toHaveLength(49)

    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    const dialog = await screen.findByRole('dialog', { name: 'Фильтры' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Процессоры' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Применить' }))

    await waitFor(() => expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article')
      .every(card => card.textContent?.includes('Процессоры'))).toBe(true))

    // An unsaved draft must not survive the navigation away from this URL.
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    const reopened = await screen.findByRole('dialog', { name: 'Фильтры' })
    fireEvent.click(within(reopened).getByRole('checkbox', { name: 'Видеокарты' }))
    expect((within(reopened).getByRole('checkbox', { name: 'Видеокарты' }) as HTMLInputElement).checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'назад' }))

    await waitFor(() => expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article')).toHaveLength(49))
    expect(screen.queryByRole('dialog', { name: 'Фильтры' })).toBeNull()

    // Returning Forward to the filtered URL must not resurrect the discarded draft.
    fireEvent.click(screen.getByRole('button', { name: 'вперёд' }))

    await waitFor(() => expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article')
      .every(card => card.textContent?.includes('Процессоры'))).toBe(true))
    expect(screen.queryByRole('dialog', { name: 'Фильтры' })).toBeNull()
  })
})

describe('catalog filter metadata states', () => {
  const drawerCheckbox = (dialog: HTMLElement) => within(dialog).getByRole('checkbox', { name: 'Видеокарты' }) as HTMLInputElement

  it('shows the filter skeleton while the metadata request is pending', async () => {
    const base = mockCatalogFetch()
    const filters = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (
      new URL(String(input), 'http://localhost').pathname === '/api/v1/products/filters' ? filters.promise : base(input)
    )))

    setup('/catalog?category=gpu')
    await screen.findByTestId('catalog-grid')
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))

    const dialog = await screen.findByRole('dialog', { name: 'Фильтры' })
    expect(within(dialog).getByTestId('filter-options-skeleton')).toBeTruthy()

    filters.resolve(new Response(JSON.stringify({
      categories: [{ id: 1, slug: 'gpu', name: 'Видеокарты', sort_order: 0 }],
      types: [], colors: [], manufacturers: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await waitFor(() => expect(within(dialog).queryByTestId('filter-options-skeleton')).toBeNull())
    expect(drawerCheckbox(dialog).checked).toBe(true)
  })

  it('stops the skeleton after a failed request and keeps the applied filters selectable', async () => {
    const base = mockCatalogFetch()
    const failing = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      return url.pathname === '/api/v1/products/filters'
        ? new Response(JSON.stringify({ detail: 'boom' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
        : base(input)
    })
    vi.stubGlobal('fetch', failing)

    setup('/catalog?category=gpu')
    await screen.findByTestId('catalog-grid')
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))

    const dialog = await screen.findByRole('dialog', { name: 'Фильтры' })
    // The placeholder must not survive the settled failure.
    await waitFor(() => expect(within(dialog).queryByTestId('filter-options-skeleton')).toBeNull())
    expect(drawerCheckbox(dialog).checked).toBe(true)
    expect(within(dialog).getByRole('alert').textContent).toContain('Фильтры недоступны')
    // Retry is reachable without closing the modal.
    expect(within(dialog).getByRole('button', { name: 'Повторить' })).toBeTruthy()
  })

  it('recovers the option groups after a retry', async () => {
    const base = mockCatalogFetch()
    let failing = true
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname !== '/api/v1/products/filters' || !failing) return base(input)
      return new Response(JSON.stringify({ detail: 'boom' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }))

    setup('/catalog?category=gpu')
    await screen.findByTestId('catalog-grid')
    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    const dialog = await screen.findByRole('dialog', { name: 'Фильтры' })
    await waitFor(() => expect(within(dialog).queryByTestId('filter-options-skeleton')).toBeNull())

    failing = false
    fireEvent.click(within(dialog).getByRole('button', { name: 'Повторить' }))

    expect(await within(dialog).findByRole('checkbox', { name: 'Процессоры' })).toBeTruthy()
    expect(within(dialog).queryByRole('alert')).toBeNull()
    expect(within(dialog).queryByTestId('filter-options-skeleton')).toBeNull()
  })

  it('reuses cached metadata and does not show the skeleton again while it refreshes', async () => {
    const base = mockCatalogFetch()
    let filtersPending = false
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/api/v1/products/filters' && filtersPending) return new Promise<Response>(() => {})
      return base(input)
    }))

    setup('/catalog?category=gpu')
    await screen.findByTestId('catalog-grid')
    filtersPending = true

    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
    const dialog = await screen.findByRole('dialog', { name: 'Фильтры' })
    expect(within(dialog).queryByTestId('filter-options-skeleton')).toBeNull()
    expect(within(dialog).getByRole('checkbox', { name: 'Процессоры' })).toBeTruthy()
  })
})

describe('catalog filter metadata fallback', () => {
  it('does not send display names as slugs when the filter endpoint fails, and says what was not applied', async () => {
    const base = mockCatalogFetch()
    const failing = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/api/v1/products/filters') {
        return new Response(JSON.stringify({ detail: 'boom' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }
      return base(input)
    })
    vi.stubGlobal('fetch', failing)

    // A type filter stored as a display name cannot be translated without metadata.
    setup('/catalog?category=gpu&types=Видеокарты&colors=Чёрный')

    const grid = await screen.findByTestId('catalog-grid')
    expect(within(grid).getAllByRole('article').length).toBeGreaterThan(0)

    const productCall = failing.mock.calls.map(([url]) => String(url)).find((url) => url.startsWith('/api/v1/products?'))
    expect(productCall).toContain('categories=gpu')
    expect(productCall).toContain('colors=%D0%A7%D1%91%D1%80%D0%BD%D1%8B%D0%B9')
    expect(productCall).not.toContain('types=')
    expect(productCall).not.toContain(encodeURIComponent('Видеокарты'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Не применены: Тип')
  })
})
