import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { createTestQueryClient, render } from '../test-utils'
import { useAccountStore } from '../stores/accountStore'
import { OrdersPage } from './OrdersPage'
import { i18n } from '../i18n'

vi.mock('../components/Header', () => ({ Header: () => <header data-testid="header" /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }))

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const date = '2026-01-01T00:00:00Z'

const order = (name: string) => ({
  id: 9,
  user_id: 7,
  status: 'completed_demo',
  total_amount: '37980.00',
  item_count: 2,
  created_at: date,
  items: [
    {
      id: 77,
      kind: 'custom_build',
      product_id: null,
      saved_build_id: null,
      sku_snapshot: null,
      name_snapshot: name,
      image_url_snapshot: null,
      unit_price: '18990.00',
      quantity: 2,
      line_total: '37980.00',
      specs_snapshot: [],
      components_snapshot: [
        { slot: 'cpu', product_id: 1, product_name: 'AMD Ryzen 5 7600', price: '18990.00' },
        { slot: 'gpu', product_id: 2, product_name: 'MSI GeForce RTX 4070', price: '18990.00' },
      ],
    },
  ],
})

beforeEach(() =>
  useAccountStore.setState({
    activeAccountId: '7',
    accounts: { '7': { account: { id: '7', username: 'test', email: 'test@example.com', displayName: 'Test', avatar: '', createdAt: 0 } } },
  }),
)

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await act(async () => { await i18n.changeLanguage('ru') })
})

describe('purchased build name', () => {
  it('renders the name stored in the order snapshot, with the separate build badge', async () => {
    const name = 'Gaming PC 2026'
    vi.stubGlobal('fetch', vi.fn(async () => json([order(name)])))
    render(<MemoryRouter><OrdersPage /></MemoryRouter>)

    expect(await screen.findByText(name)).toBeTruthy()
    expect(screen.getByText('Пользовательская сборка')).toBeTruthy()
    // The composition is still shown from the order's own component snapshot.
    expect(screen.getByText('AMD Ryzen 5 7600')).toBeTruthy()
  })

  it('keeps a user-defined name untouched in the English interface', async () => {
    const name = 'Игровой ПК «Титан» — 2026 ✦'
    await act(async () => { await i18n.changeLanguage('en') })
    vi.stubGlobal('fetch', vi.fn(async () => json([order(name)])))
    render(<MemoryRouter><OrdersPage /></MemoryRouter>)

    expect(await screen.findByText(name)).toBeTruthy()
    expect(screen.getByText('Custom build')).toBeTruthy()
  })
})

describe('orders page-critical errors', () => {
  it.each([403, 404, 429, 500, 503])('replaces the orders page with the fullscreen %i page', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'boom' }, status)))
    render(<MemoryRouter><OrdersPage /></MemoryRouter>)

    expect(await screen.findByText(String(status))).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Приносим извинения')
    // The fullscreen page replaces the page chrome instead of living inside it.
    expect(screen.queryByTestId('header')).toBeNull()
    expect(screen.queryByTestId('footer')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Мои заказы' })).toBeNull()
  })

  it('keeps an empty successful list as a valid state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([])))
    render(<MemoryRouter><OrdersPage /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Заказов пока нет' })).toBeTruthy()
    expect(screen.getByTestId('header')).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })

  it('keeps the orders when a background refetch fails', async () => {
    let failing = false
    vi.stubGlobal('fetch', vi.fn(async () => (failing ? json({ detail: 'boom' }, 503) : json([order('Gaming PC 2026')]))))
    const client = createTestQueryClient()
    render(<MemoryRouter><OrdersPage /></MemoryRouter>, { client })
    await screen.findByText('Gaming PC 2026')

    failing = true
    await act(async () => { await client.invalidateQueries() })

    expect(screen.getByText('Gaming PC 2026')).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })

  it('keeps a status outside the approved list local', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'unauthorized' }, 401)))
    render(<MemoryRouter><OrdersPage /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })

  it('keeps the login requirement for a guest and never asks for the orders', () => {
    useAccountStore.setState({ accounts: {}, activeAccountId: null })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter><OrdersPage /></MemoryRouter>)

    expect(screen.getByRole('button', { name: 'Войти' })).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
