import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
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

type Granularity = 'day' | 'month' | 'year'

function analyticsHandler(options: {
  monthly?: typeof overviewFixture.monthly
  granularity?: Granularity
  timelineMonthly?: { month: string; orders_count: number; units_count: number; amount: string }[]
  timelineGranularity?: Granularity
  emptyCompareSearch?: boolean
} = {}) {
  return (url: URL, init: RequestInit) => {
    const method = init.method ?? 'GET'
    if (url.pathname === '/api/v1/admin/stats/overview') {
      return jsonResponse({
        ...overviewFixture,
        granularity: options.granularity ?? overviewFixture.granularity,
        monthly: options.monthly ?? overviewFixture.monthly,
      })
    }
    if (url.pathname === '/api/v1/admin/stats/products' && method === 'GET') {
      if (options.emptyCompareSearch && url.searchParams.get('q')) {
        return jsonResponse({ items: [], total: 0, page: 1, page_size: 30, total_pages: 0 })
      }
      return jsonResponse(productStatsPageFixture)
    }
    if (url.pathname === '/api/v1/admin/stats/products/13') {
      return jsonResponse({
        ...productStatsDetailFixture,
        granularity: options.granularity ?? productStatsDetailFixture.granularity,
        monthly: options.monthly ?? productStatsDetailFixture.monthly,
      })
    }
    if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
    if (url.pathname === '/api/v1/admin/stats/timeline') {
      return jsonResponse({
        date_from: null, date_to: null,
        granularity: options.timelineGranularity ?? overviewFixture.granularity,
        series: [{
          product_id: 13, name: 'AMD Ryzen 5 7600', sku: 'CPU-AMD-7600',
          monthly: options.timelineMonthly ?? overviewFixture.monthly,
        }],
      })
    }
    return undefined
  }
}

function setup(options: Parameters<typeof analyticsHandler>[0] = {}) {
  const fetchMock = stubAdminFetch({ handler: analyticsHandler(options) })
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
    expect(screen.getAllByText('RTX 4070 SUPER').length).toBeGreaterThan(0)
    // The chart is named for assistive technology through its Recharts title.
    expect(document.querySelector('.recharts-surface title')?.textContent).toBe('Динамика продаж: Все товары')
    // Both horizontal rankings keep their card legends below the bars.
    expect(screen.getAllByText('Товаров в заказах').length).toBeGreaterThan(1)
    expect(screen.getAllByText('Средняя оценка').length).toBeGreaterThan(0)
    // The shared admin layout owns the only back control: no duplicate, no fixed storefront link.
    expect(screen.getAllByRole('button', { name: 'Назад' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'В магазин' })).toBeNull()
  })

  it('returns to the admin products page it was opened from', async () => {
    stubAdminFetch({ handler: analyticsHandler() })
    render(
      <MemoryRouter initialEntries={['/admin/products', '/admin/analytics']} initialIndex={1}>
        <Routes>
          <Route path="/admin/products" element={<p>Список товаров</p>} />
          <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('391')
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(await screen.findByText('Список товаров')).toBeTruthy()
    expect(screen.queryByText('Статистика продаж')).toBeNull()
  })

  it('localizes chart units and compact numbers when the language is English', async () => {
    await act(async () => { await i18n.changeLanguage('en') })
    setup()
    await screen.findByText('391')
    expect(document.body.textContent).not.toContain('шт.')
    // Localized decimal separator of the average rating.
    expect(screen.getByText('4.7')).toBeTruthy()

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

  it('labels a single-month sales period by day', async () => {
    setup({
      granularity: 'day',
      monthly: [
        { month: '2026-11-02', orders_count: 4, units_count: 6, amount: '120000' },
        { month: '2026-11-03', orders_count: 0, units_count: 0, amount: '0' },
        { month: '2026-11-04', orders_count: 3, units_count: 5, amount: '90000' },
      ],
    })
    await screen.findByText('391')
    // Day resolution reaches the axis and the grouping note, and no month name
    // is reused for a day point.
    await waitFor(() => expect(chartTexts()).toContain('2 нояб.'))
    expect(chartTexts()).toContain('3 нояб.')
    expect(chartTexts()).toContain('4 нояб.')
    expect(chartTexts()).not.toContain('Ноя')
    expect(screen.getByText('Данные сгруппированы по дням.')).toBeTruthy()
    expect(screen.queryByText('Данные сгруппированы по месяцам.')).toBeNull()
  })

  it('localizes daily labels and keeps the monthly note for monthly data', async () => {
    await act(async () => { await i18n.changeLanguage('en') })
    setup({
      granularity: 'day',
      monthly: [
        { month: '2026-11-02', orders_count: 4, units_count: 6, amount: '120000' },
        { month: '2026-11-05', orders_count: 1, units_count: 1, amount: '30000' },
      ],
    })
    await screen.findByText('391')
    await waitFor(() => expect(chartTexts()).toContain('2 Nov'))
    expect(chartTexts()).toContain('5 Nov')
    expect(screen.getByText('Data is grouped by day.')).toBeTruthy()

    await act(async () => { await i18n.changeLanguage('ru') })
    cleanup()
    setup()
    await screen.findByText('391')
    expect(screen.getByText('Данные сгруппированы по месяцам.')).toBeTruthy()
    expect(screen.queryByText('Данные сгруппированы по дням.')).toBeNull()
  })

  it('labels a compared one-month period by day on the shared axis', async () => {
    const dailyPoints = [
      { month: '2026-11-02', orders_count: 1, units_count: 2, amount: '70000' },
      { month: '2026-11-05', orders_count: 1, units_count: 1, amount: '35000' },
    ]
    const fetchMock = setup({ timelineGranularity: 'day', timelineMonthly: dailyPoints })
    await screen.findByText('391')
    fireEvent.click(screen.getByRole('button', { name: 'Сравнить товары' }))
    const checkbox = await screen.findByRole('checkbox')
    fireEvent.click(checkbox)
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/admin/stats/timeline'))).toBe(true)
    })
    await waitFor(() => expect(chartTexts()).toContain('2 нояб.'))
    expect(chartTexts()).toContain('5 нояб.')
  })

  it('labels the product statistics dialog by day when the product sold in one month', async () => {
    setup({
      granularity: 'day',
      monthly: [
        { month: '2026-11-02', orders_count: 2, units_count: 4, amount: '200000' },
        { month: '2026-11-06', orders_count: 1, units_count: 1, amount: '50000' },
      ],
    })
    await screen.findByText('391')
    fireEvent.click(screen.getByRole('tab', { name: 'По товарам' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть статистику товара AMD Ryzen 5 7600' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(chartTexts()).toContain('2 нояб.'))
    expect(chartTexts()).toContain('6 нояб.')
    expect(dialog).toBeTruthy()
  })

  it('labels a long history by year and notes the yearly grouping', async () => {
    setup({
      granularity: 'year',
      monthly: [
        { month: '2012-01-01', orders_count: 1, units_count: 2, amount: '200' },
        { month: '2019-01-01', orders_count: 1, units_count: 1, amount: '700' },
        { month: '2026-01-01', orders_count: 3, units_count: 5, amount: '1500' },
      ],
    })
    await screen.findByText('391')
    // Yearly buckets are labelled with the calendar year on the axis.
    await waitFor(() => expect(chartTexts()).toContain('2012'))
    expect(chartTexts()).toContain('2019')
    expect(chartTexts()).toContain('2026')
    expect(screen.getByText('Данные сгруппированы по годам.')).toBeTruthy()
    expect(screen.queryByText('Данные сгруппированы по месяцам.')).toBeNull()

    // The metric switch keeps working on a yearly axis.
    fireEvent.change(screen.getByLabelText('Динамика продаж'), { target: { value: 'amount' } })
    await waitFor(() => expect(chartTexts().some((text) => text.includes('₽'))).toBe(true))

    await act(async () => { await i18n.changeLanguage('en') })
    expect(screen.getByText('Data is grouped by year.')).toBeTruthy()
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
