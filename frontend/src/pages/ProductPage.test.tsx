import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { render } from '../test-utils'
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
    expect(screen.getByText('6 ядер')).toBeTruthy()
    const availability = screen.getByText('В наличии')
    expect(availability.className).toContain('text-emerald-500')
    expect(availability.querySelector('span')?.className).toContain('bg-emerald-500')
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
  it('updates the favorite state only after the server confirms it', async () => {
    useAccountStore.setState({ activeAccountId: '7', accounts: { '7': { account: { id: '7', username: 'test', email: 'test@example.com', displayName: 'Test', avatar: '', createdAt: 0 } } } })
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
