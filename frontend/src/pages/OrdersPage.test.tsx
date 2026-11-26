import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { render } from '../test-utils'
import { useAccountStore } from '../stores/accountStore'
import { OrdersPage } from './OrdersPage'
import { i18n } from '../i18n'

vi.mock('../components/Header', () => ({ Header: () => <div /> }))

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
