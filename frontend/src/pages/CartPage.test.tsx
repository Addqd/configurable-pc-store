import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { createTestQueryClient, render } from '../test-utils'
import { useAccountStore } from '../stores/accountStore'
import { CartPage } from './CartPage'

vi.mock('../components/Header', () => ({ Header: () => <div /> }))
const date = '2026-01-01T00:00:00Z'
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(() => useAccountStore.setState({ activeAccountId: '7', accounts: { '7': { account: { id: '7', username: 'test', email: 'test@example.com', displayName: 'Test', avatar: '', createdAt: 0 } } } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('server cart', () => {
  it('updates and reloads server quantity and total, then removes the item', async () => {
    let quantity = 1
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/v1/cart/8' && init.method === 'PATCH') quantity = JSON.parse(String(init.body)).quantity
      if (url === '/api/v1/cart/8' && init.method === 'DELETE') quantity = 0
      return json({ id: 1, items: quantity ? [{ id: 8, kind: 'product', product_id: 4, product: { id: 4, name: 'Server item', cover_image_url: '/p.jpg' }, quantity, unit_price: '120.00', line_total: String(quantity * 120), created_at: date, updated_at: date }] : [], subtotal: String(quantity * 120), item_count: quantity, created_at: date, updated_at: date })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><CartPage /></MemoryRouter>)
    await screen.findByText('Server item')
    fireEvent.click(screen.getByRole('button', { name: /Увеличить количество.*Server item/i }))
    await waitFor(() => expect(screen.getByLabelText(/Количество: 2/i)).toBeTruthy())
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/v1/cart').length).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole('button', { name: /Удалить.*Server item/i }))
    await screen.findByRole('heading', { name: 'Корзина пуста' })
  })
  it('does not display checkout success when the server rejects the order', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/checkout')
      ? json({ detail: 'out of stock' }, 409)
      : json({ id: 1, items: [{ id: 8, kind: 'product', product_id: 4, product: { name: 'Server item' }, quantity: 1, unit_price: '120.00', line_total: '120.00', created_at: date, updated_at: date }], subtotal: '120.00', item_count: 1, created_at: date, updated_at: date })))
    render(<MemoryRouter><CartPage /></MemoryRouter>)
    await screen.findByText('Server item')
    fireEvent.click(screen.getByRole('button', { name: 'Купить' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/Спасибо за заказ/i)).toBeNull()
  })
})

describe('fullscreen cart errors', () => {
  const cartPayload = {
    id: 1, items: [{ id: 8, kind: 'product', product_id: 4, product: { id: 4, name: 'Server item', cover_image_url: '/p.jpg' }, quantity: 1, unit_price: '120.00', line_total: '120.00', created_at: date, updated_at: date }],
    subtotal: '120.00', item_count: 1, created_at: date, updated_at: date,
  }

  it.each([403, 404, 429, 500, 503])('replaces the cart with the fullscreen %i page when the cart request has no data', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'boom' }, status)))
    render(<MemoryRouter><CartPage /></MemoryRouter>)

    expect(await screen.findByText(String(status))).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Приносим извинения')
    expect(screen.queryByRole('button', { name: /Купить/ })).toBeNull()
  })

  it('keeps a status outside the approved list local', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'conflict' }, 409)))
    render(<MemoryRouter><CartPage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })

  it('keeps the login requirement for a guest and never asks for the cart', () => {
    useAccountStore.setState({ accounts: {}, activeAccountId: null })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><CartPage /></MemoryRouter>)

    expect(screen.getByRole('button', { name: 'Войти' })).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps retained cart data when a background refresh fails', async () => {
    let failing = false
    const fetchMock = vi.fn(async (url: string) => {
      if (failing && url === '/api/v1/cart') return json({ detail: 'boom' }, 503)
      if (url === '/api/v1/cart') return json(cartPayload)
      return json({ detail: 'not found' }, 404)
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createTestQueryClient()
    render(<MemoryRouter><CartPage /></MemoryRouter>, { client })
    await screen.findByText('Server item')

    failing = true
    await act(async () => { await client.invalidateQueries() })

    // The visitor keeps seeing the cart they had instead of an empty error screen.
    expect(screen.getByText('Server item')).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })

  it('keeps a checkout success state and does not repeat the order after a failed refresh', async () => {
    let checkouts = 0
    let cartReads = 0
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/checkout') && init.method === 'POST') {
        checkouts += 1
        return json({ order: { id: 5, user_id: 7, status: 'completed_demo', total_amount: '120.00', item_count: 1, created_at: date, items: [] } })
      }
      if (url === '/api/v1/cart') {
        cartReads += 1
        // The refresh after the successful checkout is the one that fails.
        return cartReads > 1 ? json({ detail: 'boom' }, 503) : json(cartPayload)
      }
      return json([])
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><CartPage /></MemoryRouter>)
    await screen.findByText('Server item')

    fireEvent.click(screen.getByRole('button', { name: 'Купить' }))

    expect(await screen.findByRole('heading', { name: 'Спасибо!' })).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
    expect(checkouts).toBe(1)
  })
})

describe('saved build in the cart', () => {
  const buildLine = (name?: string, quantity = 1) => ({
    id: 12, kind: 'custom_build', product_id: null, saved_build_id: 42, product: null, quantity,
    unit_price: '18990.00', line_total: String(18990 * quantity), created_at: date, updated_at: date,
    build_snapshot: {
      total_price: '18990.00',
      ...(name === undefined ? {} : { name }),
      components: [{ slot: 'cpu', product_id: 4, product_name: 'AMD Ryzen 5 7600', price: '18990.00' }],
    },
  })
  const cart = (line: Record<string, unknown>) => ({
    id: 1, items: [line], subtotal: String(18990 * Number(line.quantity)),
    item_count: Number(line.quantity), created_at: date, updated_at: date,
  })

  it('shows the captured saved-build name and keeps it when the quantity changes', async () => {
    let quantity = 1
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url === '/api/v1/cart/12' && init.method === 'PATCH') quantity = JSON.parse(String(init.body)).quantity
      // The server answers with the snapshot it stored, not a rebuilt name.
      return json(cart(buildLine('Gaming PC 2026', quantity)))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><CartPage /></MemoryRouter>)

    expect(await screen.findByText('Gaming PC 2026')).toBeTruthy()
    expect(screen.getByText('Пользовательская сборка')).toBeTruthy()
    expect(screen.getByText('AMD Ryzen 5 7600')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Увеличить количество.*Gaming PC 2026/i }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/v1/cart/12' && init.method === 'PATCH')).toBe(true))
    // The unchanged captured name is still rendered after the reload.
    expect(await screen.findByText('Gaming PC 2026')).toBeTruthy()
  })

  it('uses the generic title for a configuration that was never named', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(cart(buildLine()))))
    render(<MemoryRouter><CartPage /></MemoryRouter>)

    expect(await screen.findByText('Сборка ПК')).toBeTruthy()
    expect(screen.queryByText('Gaming PC 2026')).toBeNull()
  })
})
