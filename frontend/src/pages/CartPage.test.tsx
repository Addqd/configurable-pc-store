import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { render } from '../test-utils'
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
