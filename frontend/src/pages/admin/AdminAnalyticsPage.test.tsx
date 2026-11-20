import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { render } from '../../test-utils'
import i18n from '../../i18n'
import { AdminAnalyticsPage } from './AdminAnalyticsPage'
import {
  callsTo, jsonResponse, overviewFixture, productOptionsFixture,
  productStatsDetailFixture, productStatsPageFixture, stubAdminFetch,
} from '../../test-admin-api'

vi.mock('../../components/Header', () => ({ Header: () => <header data-testid="header" /> }))

const multiYearMonthly = [
  { month: '2025-12-01', orders_count: 10, units_count: 12, amount: '100000' },
  { month: '2026-01-01', orders_count: 11, units_count: 15, amount: '120000' },
  { month: '2026-02-01', orders_count: 12, units_count: 18, amount: '130000' },
]

function setup(options: { monthly?: typeof overviewFixture.monthly; emptyCompareSearch?: boolean } = {}) {
  const handler = (url: URL, init: RequestInit) => {
    const method = init.method ?? 'GET'
    if (url.pathname === '/api/v1/admin/stats/overview') {
      return jsonResponse({ ...overviewFixture, monthly: options.monthly ?? overviewFixture.monthly })
    }
    if (url.pathname === '/api/v1/admin/stats/products' && method === 'GET') {
      if (options.emptyCompareSearch && url.searchParams.get('q')) {
        return jsonResponse({ items: [], total: 0, page: 1, page_size: 30, total_pages: 0 })
      }
      return jsonResponse(productStatsPageFixture)
    }
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

const chartTexts = () => Array.from(document.querySelectorAll('svg text')).map((node) => node.textContent ?? '')

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await act(async () => { await i18n.changeLanguage('ru') })
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
    expect(screen.getByText('0 шт.')).toBeTruthy()
  })

  it('localizes chart units and compact numbers when the language is English', async () => {
    await act(async () => { await i18n.changeLanguage('en') })
    setup()
    await screen.findByText('391')
    expect(document.body.textContent).not.toContain('шт.')
    expect(screen.getByText('0 pcs')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Sales dynamics'), { target: { value: 'amount' } })
    await waitFor(() => expect(chartTexts().some((text) => text.includes('₽'))).toBe(true))
    const texts = chartTexts().join(' ')
    expect(texts).not.toContain('тыс.')
    expect(texts).toMatch(/\d(\.\d)?m\b/i)
  })

  it('adds the year to month labels when the range spans several years', async () => {
    setup({ monthly: multiYearMonthly })
    await screen.findByText('391')
    expect(await screen.findByText('Дек 2025')).toBeTruthy()
    expect(screen.getByText('Янв 2026')).toBeTruthy()
    expect(screen.getByText('Фев 2026')).toBeTruthy()
    expect(screen.queryByText('Дек')).toBeNull()
  })

  it('keeps compact month-only labels inside one year', async () => {
    setup()
    await screen.findByText('391')
    expect(screen.getByText('Июн')).toBeTruthy()
    expect(screen.queryByText('Июн 2026')).toBeNull()
  })

  it('keeps the selected comparison product name when the search results no longer contain it', async () => {
    const fetchMock = setup({ emptyCompareSearch: true })
    await screen.findByText('391')
    fireEvent.click(screen.getByRole('button', { name: 'Сравнить товары' }))
    const checkbox = await screen.findByRole('checkbox')
    fireEvent.click(checkbox)

    expect(await screen.findByRole('button', { name: /AMD Ryzen 5 7600/ })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Поиск товара...'), { target: { value: 'zzz' } })
    await waitFor(() => {
      expect(callsTo(fetchMock, '/api/v1/admin/stats/products').some(([url]) => String(url).includes('q=zzz'))).toBe(true)
    })
    await waitFor(() => expect(screen.queryByRole('checkbox')).toBeNull())

    const chip = screen.getByRole('button', { name: /AMD Ryzen 5 7600/ })
    expect(within(chip).queryByText('#13')).toBeNull()
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
