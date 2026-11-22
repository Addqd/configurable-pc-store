import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { render } from '../../test-utils'
import { AdminProductsPage } from './AdminProductsPage'
import {
  callsTo, jsonResponse, noContent, productOptionsFixture, productSummaryFixture,
  stubAdminFetch,
} from '../../test-admin-api'

vi.mock('../../components/Header', () => ({ Header: () => <header data-testid="header" /> }))

const secondProduct = {
  ...productSummaryFixture,
  id: 8,
  name: 'ASUS GeForce RTX 4070 Ti SUPER TUF Gaming 16G',
  price: '89990.00',
}

function RouterProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">{`${location.pathname}${location.search}`}</output>
      <button type="button" onClick={() => navigate(-1)}>Go back</button>
    </>
  )
}

function setup(failDeactivate = false) {
  const handler = (url: URL, init: RequestInit) => {
    if (url.pathname === '/api/v1/admin/products' && (init.method ?? 'GET') === 'GET') {
      const status = url.searchParams.get('status')
      return jsonResponse({
        items: [productSummaryFixture, secondProduct],
        total: status === 'active' ? 51 : 51,
        page: Number(url.searchParams.get('page') ?? 1),
        page_size: Number(url.searchParams.get('page_size') ?? 10),
        total_pages: 6,
      })
    }
    if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
    if (url.pathname === '/api/v1/products/filters') {
      return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
    }
    if (url.pathname === '/api/v1/admin/products/7' && init.method === 'DELETE') {
      return failDeactivate ? jsonResponse({ detail: 'boom' }, 500) : noContent()
    }
    return undefined
  }
  const fetchMock = stubAdminFetch({ handler })
  render(<MemoryRouter><AdminProductsPage /><RouterProbe /></MemoryRouter>)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('admin products page', () => {
  it('renders the reference layout and real API-backed rows', async () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Панель администратора' })).toBeTruthy()
    expect(await screen.findByText(productSummaryFixture.name)).toBeTruthy()
    expect(screen.getByText('ASUS GeForce RTX 4070 Ti SUPER TUF Gaming 16G')).toBeTruthy()
    expect(screen.getByText('Всего:')).toBeTruthy()
    expect(screen.getByText('Активных:')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Добавить товар' }).getAttribute('href')).toBe('/admin/products/new')
    expect(screen.getByRole('link', { name: 'Статистика продаж' }).getAttribute('href')).toBe('/admin/analytics')
    // The shared admin chrome owns the only back control on every admin page.
    expect(screen.getAllByRole('button', { name: 'Назад' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'В магазин' })).toBeNull()
    // Products/Users are separate routes: real links, not ARIA tabs.
    expect(screen.getByRole('link', { name: 'Пользователи' }).getAttribute('href')).toBe('/admin/users')
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('shows every sort value the URL accepts in the sort select', async () => {
    setup()
    await screen.findByText(productSummaryFixture.name)
    const select = screen.getByLabelText('Сортировка') as HTMLSelectElement
    const values = Array.from(select.options).map((option) => option.value)
    expect(values).toEqual([
      'created_desc', 'created_asc', 'updated_desc', 'updated_asc',
      'name_asc', 'name_desc', 'price_asc', 'price_desc',
      'stock_asc', 'stock_desc', 'id_asc', 'id_desc',
    ])
  })

  it('keeps the value of an accepted but previously hidden sort', async () => {
    const fetchMock = setup()
    await screen.findByText(productSummaryFixture.name)
    fireEvent.change(screen.getByLabelText('Сортировка'), { target: { value: 'updated_asc' } })
    expect((screen.getByLabelText('Сортировка') as HTMLSelectElement).value).toBe('updated_asc')
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('sort=updated_asc'))).toBe(true)
    })
  })

  it('sends search and filter changes to the API', async () => {
    const fetchMock = setup()
    await screen.findByText(productSummaryFixture.name)

    fireEvent.change(screen.getByLabelText('Поиск товаров по названию или SKU'), { target: { value: 'RTX' } })
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('q=RTX'))).toBe(true)
    })

    fireEvent.change(screen.getByLabelText('Категория'), { target: { value: 'gpu' } })
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('category=gpu'))).toBe(true)
    })

    fireEvent.change(screen.getByLabelText('Статус'), { target: { value: 'active' } })
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=active'))).toBe(true)
    })
  })

  it('deactivates only after explicit confirmation and refreshes the list', async () => {
    const fetchMock = setup()
    await screen.findByText(productSummaryFixture.name)
    const row = screen.getByText(productSummaryFixture.name).closest('tr')
    if (!row) throw new Error('row missing')
    fireEvent.click(within(row).getByRole('button', { name: 'Удалить' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Деактивировать товар?' })).toBeTruthy()
    expect(callsTo(fetchMock, '/api/v1/admin/products/7').length).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Деактивировать' }))
    await waitFor(() => {
      expect(callsTo(fetchMock, '/api/v1/admin/products/7').some(([, init]) => init.method === 'DELETE')).toBe(true)
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows the server error and keeps the dialog open when deactivation fails', async () => {
    setup(true)
    await screen.findByText(productSummaryFixture.name)
    const row = screen.getByText(productSummaryFixture.name).closest('tr')
    if (!row) throw new Error('row missing')
    fireEvent.click(within(row).getByRole('button', { name: 'Удалить' }))
    fireEvent.click(screen.getByRole('button', { name: 'Деактивировать' }))
    expect(await screen.findByText('Сервер не смог выполнить запрос. Попробуйте позже.')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('requests the next page', async () => {
    const fetchMock = setup()
    await screen.findByText(productSummaryFixture.name)
    fireEvent.click(screen.getByRole('button', { name: 'Страница 2' }))
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true)
    })
  })

  it('does not let a stale debounced draft overwrite the query restored by Back', async () => {
    const fetchMock = stubAdminFetch({
      handler: (url, init) => {
        if (url.pathname === '/api/v1/admin/products' && (init.method ?? 'GET') === 'GET') {
          return jsonResponse({ items: [productSummaryFixture], total: 1, page: 1, page_size: 10, total_pages: 1 })
        }
        if (url.pathname === '/api/v1/admin/product-options') return jsonResponse(productOptionsFixture)
        if (url.pathname === '/api/v1/products/filters') {
          return jsonResponse({ categories: [], types: [], colors: ['Чёрный'], manufacturers: [] })
        }
        return undefined
      },
    })
    render(
      <MemoryRouter initialEntries={['/admin/products?q=abc', '/admin/products?q=abd']} initialIndex={1}>
        <AdminProductsPage />
        <RouterProbe />
      </MemoryRouter>,
    )
    const search = (await screen.findByLabelText('Поиск товаров по названию или SKU')) as HTMLInputElement
    await waitFor(() => expect(search.value).toBe('abd'))

    // Type, then navigate back before the debounce fires.
    fireEvent.change(search, { target: { value: 'abcdef' } })
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/admin/products?q=abc'))
    await waitFor(() => expect((screen.getByLabelText('Поиск товаров по названию или SKU') as HTMLInputElement).value).toBe('abc'))

    // Give the pending debounce (300 ms) time to fire; it must stay cancelled.
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(screen.getByTestId('location').textContent).toBe('/admin/products?q=abc')
    expect((screen.getByLabelText('Поиск товаров по названию или SKU') as HTMLInputElement).value).toBe('abc')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('q=abcdef'))).toBe(false)
  })
})
