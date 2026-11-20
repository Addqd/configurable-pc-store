import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { render } from '../../test-utils'
import { AdminAnalyticsPage } from './AdminAnalyticsPage'
import {
  callsTo, jsonResponse, overviewFixture, productOptionsFixture,
  productStatsDetailFixture, productStatsPageFixture, stubAdminFetch,
} from '../../test-admin-api'

vi.mock('../../components/Header', () => ({ Header: () => <header data-testid="header" /> }))

function setup() {
  const handler = (url: URL, init: RequestInit) => {
    const method = init.method ?? 'GET'
    if (url.pathname === '/api/v1/admin/stats/overview') return jsonResponse(overviewFixture)
    if (url.pathname === '/api/v1/admin/stats/products' && method === 'GET') return jsonResponse(productStatsPageFixture)
    if (url.pathname === '/api/v1/admin/stats/products/13') return jsonResponse(productStatsDetailFixture)
    if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
    if (url.pathname === '/api/v1/admin/stats/timeline') {
      return jsonResponse({
        date_from: null, date_to: null,
        series: [{ product_id: 13, name: 'AMD Ryzen 5 7600', sku: 'CPU-AMD-7600', monthly: overviewFixture.monthly }],
      })
    }
    return undefined
  }
  const fetchMock = stubAdminFetch({ handler })
  render(<MemoryRouter initialEntries={['/admin/analytics']}><AdminAnalyticsPage /></MemoryRouter>)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('admin analytics', () => {
  it('renders the overview KPIs and top-product sections from the API', async () => {
    setup()
    expect(await screen.findByText('391')).toBeTruthy()
    expect(screen.getByText('782')).toBeTruthy()
    expect(screen.getByText('22 871 420 ₽')).toBeTruthy()
    expect(screen.getByText('4,7')).toBeTruthy()
    expect(screen.getAllByText('AMD Ryzen 5 7600').length).toBeGreaterThan(0)
    expect(screen.getByText('RTX 4070 SUPER')).toBeTruthy()
    expect(screen.getByRole('img', { name: /Динамика продаж/ })).toBeTruthy()
  })

  it('requests a comparison timeline for the selected products', async () => {
    const fetchMock = setup()
    await screen.findByText('391')
    fireEvent.click(screen.getByRole('button', { name: 'Сравнить товары' }))
    const checkbox = await screen.findByRole('checkbox')
    fireEvent.click(checkbox)
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/admin/stats/timeline'))).toBe(true)
    })
    expect(callsTo(fetchMock, '/api/v1/admin/stats/timeline')[0]?.[0].toString()).toContain('product_ids=13')
  })

  it('opens the product-specific statistics modal and renders its review distribution', async () => {
    setup()
    await screen.findByText('391')
    fireEvent.click(screen.getByRole('tab', { name: 'По товарам' }))
    expect(await screen.findByText('Статистика по товарам')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть статистику товара AMD Ryzen 5 7600' }))

    expect(await screen.findByRole('heading', { name: 'AMD Ryzen 5 7600' })).toBeTruthy()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Персональная статистика товара · Процессоры')).toBeTruthy()
    expect(within(dialog).getByText('124')).toBeTruthy()
    expect(within(dialog).getByText('2 354 760 ₽')).toBeTruthy()
    expect(within(dialog).getByText('86 отзывов')).toBeTruthy()
    expect(within(dialog).getByText('54')).toBeTruthy()

    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Закрыть' }).at(-1) as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
