import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { render, createTestQueryClient } from '../test-utils'
import { mockCatalogFetch } from '../test-api'
import { useAccountStore } from '../stores/accountStore'
import { useUIStore } from '../stores/uiStore'
import { ProductPage } from './ProductPage'

vi.mock('../components/Header', () => ({ Header: () => <div /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div /> }))
const setup = (slug = 'cpu-ryzen-5-7600') => render(<MemoryRouter initialEntries={[`/products/${slug}`]}><Routes><Route path="/products/:slug" element={<ProductPage />} /></Routes></MemoryRouter>)
beforeEach(() => { mockCatalogFetch(); useAccountStore.setState({ accounts: {}, activeAccountId: null }); useUIStore.setState({ authModalOpen: false }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('server product page', () => {
  it('renders description, price and specs from the product response', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'AMD Ryzen 5 7600' })).toBeTruthy()
    expect(screen.getByText('Server description')).toBeTruthy()
    expect(screen.getByText(/18\s*990/)).toBeTruthy()
    expect(screen.getByText('5.1 ГГц')).toBeTruthy()
    const availability = screen.getByText('В наличии')
    expect(availability.className).toContain('text-emerald-500')
    expect(availability.querySelector('span')?.className).toContain('bg-emerald-500')
  })
  it('renders the show_in_details characteristic rows and never internal metadata', async () => {
    setup('gaming-pc-powerplay')
    expect(await screen.findByText('Кэш L3')).toBeTruthy()
    expect(screen.getByText('32 МБ')).toBeTruthy()
    expect(screen.getByText('Техпроцесс')).toBeTruthy()
    expect(screen.queryByText(/test-fixture-must-not-render/)).toBeNull()
    // Technical (compatibility-engine) keys must not be shown as customer specs.
    expect(screen.queryByText('socket')).toBeNull()
    // The section keeps its collapse/expand behaviour with more than four rows.
    expect(screen.queryByText('Максимальная температура')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Все характеристики' }))
    expect(screen.getByText('Максимальная температура')).toBeTruthy()
    expect(screen.getByText('95 °C')).toBeTruthy()
  })
  it('shows and copies the server SKU', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    setup()
    const button = await screen.findByRole('button', { name: /SKU-TEST-13/ })
    fireEvent.click(button)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('SKU-TEST-13'))
  })

  it('uses muted availability styling when the product is out of stock', async () => {
    const catalogFetch = vi.mocked(fetch)
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const result = await catalogFetch(url)
      if (url.endsWith('/products/cpu-ryzen-5-7600')) {
        return new Response(JSON.stringify({ ...await result.json(), stock_quantity: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return result
    }))
    setup()
    const label = await screen.findByText('Нет в наличии')
    expect(label.className).toContain('text-text-muted')
    expect(label.querySelector('span')?.className).toContain('bg-text-muted')
    expect((screen.getByRole('button', { name: 'Купить сейчас' }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('shows an error for an unavailable product rather than mock content', async () => {
    setup('missing')
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось загрузить')
    expect(screen.queryByText('Server description')).toBeNull()
  })
  it('requests authentication when a guest adds a product', async () => {
    setup()
    await screen.findByRole('heading', { name: 'AMD Ryzen 5 7600' })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить в корзину' }))
    expect(useUIStore.getState().authModalOpen).toBe(true)
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/cart/products'))).toBe(false)
  })
  it('retries an uncertain buy-now request with the same key, then uses a new key for a new purchase', async () => {
    useAccountStore.setState({ activeAccountId: '7', accounts: { '7': { account: { id: '7', username: 'test', email: 'test@example.com', displayName: 'Test', avatar: '', createdAt: 0 } } } })
    const catalogFetch = vi.mocked(fetch)
    const keys: string[] = []
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/cart/buy-now')) {
        keys.push(JSON.parse(String(init.body)).idempotency_key)
        if (keys.length === 1) throw new TypeError('network disconnected')
        return new Response(JSON.stringify({ order: { id: keys.length, user_id: 7, status: 'completed_demo', total_amount: '1.00', item_count: 1, items: [], created_at: '2026-01-01T00:00:00Z' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/reviews/my')) return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/is_favorited')) return new Response('{"is_favorited":false}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      return catalogFetch(url)
    })
    vi.stubGlobal('fetch', mock)
    setup()
    const button = await screen.findByRole('button', { name: 'Купить сейчас' })
    fireEvent.click(button)
    await waitFor(() => expect(keys).toHaveLength(1))
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(button)
    await waitFor(() => expect(keys).toHaveLength(2))
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(button)
    await waitFor(() => expect(keys).toHaveLength(3))
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[1])
  })
  it('does not insert a review when the server rejects it', async () => {
    useAccountStore.setState({ activeAccountId: '7', accounts: { '7': { account: { id: '7', username: 'test', email: 'test@example.com', displayName: 'Test', avatar: '', createdAt: 0 } } } })
    const catalogFetch = vi.mocked(fetch)
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/reviews/my')) return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/is_favorited')) return new Response('{"is_favorited":false}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/reviews') && init.method === 'POST') return new Response('{"detail":"purchase required"}', { status: 403, headers: { 'Content-Type': 'application/json' } })
      return catalogFetch(url)
    })
    vi.stubGlobal('fetch', mock)
    setup()
    await screen.findByRole('heading', { name: 'AMD Ryzen 5 7600' })
    const write = await screen.findByRole('button', { name: 'Оставить отзыв' }) as HTMLButtonElement
    await waitFor(() => expect(write.disabled).toBe(false))
    fireEvent.click(write)
    fireEvent.change(screen.getByLabelText('Текст отзыва'), { target: { value: 'My review text' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('Не удалось загрузить'))
    expect(screen.queryByText('My review text', { selector: 'p' })).toBeNull()
    expect(mock.mock.calls.some(([url, init]) => url.endsWith('/reviews') && init.method === 'POST')).toBe(true)
  })
  it('updates the favorite state only after the server confirms it', async () => {    useAccountStore.setState({ activeAccountId: '7', accounts: { '7': { account: { id: '7', username: 'test', email: 'test@example.com', displayName: 'Test', avatar: '', createdAt: 0 } } } })
    const catalogFetch = vi.mocked(fetch)
    let favorited = false
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/reviews/my')) return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.endsWith('/is_favorited')) return new Response(JSON.stringify({ is_favorited: favorited }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (/\/favorites\/\d+$/.test(url) && init.method === 'POST') {
        favorited = true
        return new Response(JSON.stringify({ user_id: 7, product_id: 13, product_slug: 'cpu-ryzen-5-7600', product_name: 'AMD Ryzen 5 7600', created_at: '2026-01-01T00:00:00Z' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return catalogFetch(url)
    })
    vi.stubGlobal('fetch', mock)
    setup()
    await screen.findByRole('heading', { name: 'AMD Ryzen 5 7600' })
    const button = screen.getByRole('button', { name: 'В избранное' }) as HTMLButtonElement
    await waitFor(() => expect(button.disabled).toBe(false))
    fireEvent.click(button)
    await waitFor(() => expect(favorited).toBe(true))
    expect(await screen.findByRole('button', { name: 'Убрать из избранного' })).toBeTruthy()
  })
})

describe('product reviews request states', () => {
  const reviewItem = {
    id: 501, product_id: 13, product_slug: 'cpu-ryzen-5-7600', product_name: 'AMD Ryzen 5 7600',
    user_id: 101, source: 'user', author_name: null, reviewer_name: 'Клиент 1', rating: 5,
    body: 'Проверенный отзыв', is_published: true, store_reply: null,
    displayed_at: '2026-11-17T14:30:00Z', created_at: '2026-11-17T14:30:00Z', updated_at: '2026-11-17T14:30:00Z',
  }
  const reviewsPage = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 50, total_pages: 1, average_rating: items.length ? 5 : 0 })

  it('does not claim an empty review list when the request fails, and recovers on retry', async () => {
    const catalogFetch = vi.mocked(fetch)
    let failing = true
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      if (/\/reviews$/.test(new URL(url, 'http://localhost').pathname)) {
        return failing
          ? new Response(JSON.stringify({ detail: 'boom' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
          : new Response(JSON.stringify(reviewsPage([reviewItem])), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return catalogFetch(url, init)
    })
    vi.stubGlobal('fetch', mock)
    setup()

    const retry = await screen.findByRole('button', { name: 'Повторить' })
    expect(screen.queryByText('Отзывов пока нет. Вы можете оставить первый.')).toBeNull()
    expect(screen.queryByText('Проверенный отзыв')).toBeNull()

    failing = false
    fireEvent.click(retry)

    expect(await screen.findByText('Проверенный отзыв')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull()
  })

  it('keeps a cached review list visible during a background refetch', async () => {
    const catalogFetch = vi.mocked(fetch)
    const client = createTestQueryClient()
    let pending = false
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      const isReviews = /\/reviews$/.test(new URL(url, 'http://localhost').pathname)
      if (isReviews && pending) return new Promise<Response>(() => {})
      if (isReviews) {
        return new Response(JSON.stringify(reviewsPage([reviewItem])), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return catalogFetch(url, init)
    })
    vi.stubGlobal('fetch', mock)
    render(<MemoryRouter initialEntries={['/products/cpu-ryzen-5-7600']}><Routes><Route path="/products/:slug" element={<ProductPage />} /></Routes></MemoryRouter>, { client })

    expect(await screen.findByText('Проверенный отзыв')).toBeTruthy()
    pending = true
    await act(async () => { void client.refetchQueries({ queryKey: ['product-reviews', 13] }) })

    expect(screen.getByText('Проверенный отзыв')).toBeTruthy()
    expect(screen.queryByTestId('product-reviews-skeleton')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull()
  })
})
