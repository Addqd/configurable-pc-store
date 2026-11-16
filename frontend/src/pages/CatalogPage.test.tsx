import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within, waitFor } from '@testing-library/react'
import { render } from '../test-utils'
import { mockCatalogFetch } from '../test-api'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { CatalogPage } from './CatalogPage'

vi.mock('../components/Header', () => ({ Header: () => <div /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div /> }))
vi.mock('../components/CatalogProductCard', () => ({ CatalogProductCard: ({ product }: { product: { name: string; category: string; shortSpecs?: string[] } }) => <article>{product.category}: {product.name}<span>{product.shortSpecs?.[0]}</span></article> }))
const setup = (path = '/catalog') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/catalog" element={<CatalogPage />} /></Routes></MemoryRouter>)
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
  it('shows an error instead of an empty success when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    setup()
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some(node => node.textContent?.includes('Не удалось загрузить'))).toBe(true)
    expect(screen.queryByTestId('catalog-grid')).toBeNull()
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
