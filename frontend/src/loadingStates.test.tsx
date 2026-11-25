import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { createTestQueryClient, render } from './test-utils'
import { cartFixture, jsonResponse, ownerFixture, stubAdminFetch } from './test-admin-api'
import { Skeleton, SkeletonText } from './components/ui/skeleton'
import { SkeletonRegion } from './components/skeletons/SkeletonRegion'
import { CatalogGridSkeleton, ProductSectionSkeleton } from './components/skeletons/StoreSkeletons'
import { AdminTableSkeleton, AnalyticsOverviewSkeleton, AdminPageSkeleton, BarListSkeleton, ChartSkeleton, ProductStatsSkeleton } from './components/skeletons/AdminSkeletons'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'
import { CartPage } from './pages/CartPage'
import { ProductPage } from './pages/ProductPage'
import { OrdersPage } from './pages/OrdersPage'
import { SavesPage } from './pages/SavesPage'
import { AccountPage } from './pages/AccountPage'
import { AdminGate } from './admin/access'
import { AdminProductsPage } from './pages/admin/AdminProductsPage'
import { useAccountStore } from './stores/accountStore'

vi.mock('./components/Header', () => ({ Header: () => <header data-testid="header" /> }))
vi.mock('./components/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }))
vi.mock('./components/WhyChooseUs', () => ({ WhyChooseUs: () => <div /> }))
vi.mock('./components/PromotionalBanner', () => ({ PromotionalBanner: () => <div /> }))

const account = {
  id: '66', email: 'owner@example.test', username: 'owner',
  displayName: 'Александр', avatar: '', createdAt: 0,
}

const product = (id: number, name: string) => ({
  id, slug: `product-${id}`, name, price: '1000.00', short_characteristics: [{ code: 'gpu_model', name: 'Графический процессор', data_type: 'string', editor: 'select', unit: null, sort_order: 0, is_required: false, show_in_short: true, show_in_details: true, value: 'spec', display_value: 'spec', options: [{ option_id: 602, value: 'spec', quantity: 1 }] }], color: null,
  graphics_chip_brand: null, on_sale: false, is_active: true, cover_image_url: '/placeholder.png',
  images: [], average_rating: 4, review_count: 1,
  category: { id: 1, slug: 'gpu', name: 'Видеокарты', sort_order: 0 },
  product_type: { id: 1, category_id: 1, slug: 'type', name: 'Видеокарты' },
  manufacturer: { id: 1, slug: 'maker', name: 'Maker' },
})

const page = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 6, total_pages: 1 })

/** A request that never settles: the query stays in its initial pending state. */
const never = () => new Promise<Response>(() => {})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

type Route = (url: URL) => Response | Promise<Response> | undefined

/** Minimal API stub; unlisted paths answer 404 so no test waits on an unknown request. */
function stubFetch(route: Route) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    // The test's own route wins, including a deliberately pending promise: the
    // default cart fixture must never replace a request a test holds open.
    const custom = await route(url)
    if (custom !== undefined) return custom
    if (url.pathname === '/api/v1/cart') return jsonResponse(cartFixture)
    return jsonResponse({ detail: 'Not found' }, 404)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

beforeEach(() => {
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('skeleton primitives', () => {
  it('marks a placeholder as decorative and uses the shared shimmer surface', () => {
    const { container } = render(<Skeleton className="h-4 w-10" />)
    const element = container.querySelector('[data-slot="skeleton"]')
    expect(element).toBeTruthy()
    expect(element?.getAttribute('aria-hidden')).toBe('true')
    expect(element?.className).toContain('pc-skeleton')
    expect(element?.className).toContain('h-4')
  })

  it('renders the inline variant as a span so it stays inside a text flow', () => {
    const { container } = render(<p>Всего: <SkeletonText className="h-4 w-8" /></p>)
    const element = container.querySelector('[data-slot="skeleton"]')
    expect(element?.tagName).toBe('SPAN')
    expect(container.querySelector('p > span[data-slot="skeleton"]')).toBeTruthy()
  })

  it('announces a loading region once and keeps the placeholders out of the a11y tree', () => {
    render(<SkeletonRegion testId="region"><Skeleton className="h-4 w-10" /><SkeletonText className="h-3 w-6" /></SkeletonRegion>)
    const region = screen.getByTestId('region')
    expect(region.getAttribute('role')).toBe('status')
    expect(region.getAttribute('aria-live')).toBe('polite')
    // A live region that stays `aria-busy` for its whole life postpones its own
    // announcement until it is already unmounted, so the region must not be busy.
    expect(region.hasAttribute('aria-busy')).toBe(false)
    expect(region.textContent).toBe('Загрузка...')
    expect(within(region).getByText('Загрузка...')).toBeTruthy()
    const placeholders = region.querySelectorAll('[data-slot="skeleton"]')
    expect(placeholders).toHaveLength(2)
    placeholders.forEach((placeholder) => expect(placeholder.getAttribute('aria-hidden')).toBe('true'))
  })

  it('announces a nested skeleton through its outer region only', () => {
    const page = render(<AdminPageSkeleton />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    // The nested table keeps its own marker without opening a second live region.
    expect(page.getByTestId('admin-table-skeleton')).toBeTruthy()
    page.unmount()

    const overview = render(<AnalyticsOverviewSkeleton />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    // Chart and ranking placeholders are still rendered, just not announced twice.
    expect(overview.getAllByTestId('chart-skeleton')).toHaveLength(1)
    expect(overview.getAllByTestId('bar-list-skeleton')).toHaveLength(2)
    overview.unmount()

    const stats = render(<ProductStatsSkeleton />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(stats.getByTestId('chart-skeleton')).toBeTruthy()
    stats.unmount()
  })

  it.each([
    ['chart', <ChartSkeleton key="chart" />],
    ['table', <AdminTableSkeleton key="table" columns={[{ widthClass: 'w-[40%]' }]} rows={2} />],
    ['ranking', <BarListSkeleton key="ranking" />],
  ])('keeps one announcement for a standalone %s placeholder', (_name, element) => {
    const { unmount } = render(element)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBeNull()
    unmount()
  })

  it('accepts a region-specific label', () => {
    render(<SkeletonRegion label="Загружаем таблицу"><Skeleton /></SkeletonRegion>)
    expect(screen.getByRole('status').textContent).toBe('Загружаем таблицу')
  })

  it('reproduces the documented grid and table geometry', () => {
    const section = render(<ProductSectionSkeleton />)
    expect(section.container.querySelectorAll('.grid > div')).toHaveLength(6)
    section.unmount()

    const grid = render(<CatalogGridSkeleton />)
    expect(grid.container.querySelectorAll('[data-testid="catalog-grid-skeleton"] > div')).toHaveLength(49)
    grid.unmount()

    const table = render(
      <AdminTableSkeleton columns={[{ widthClass: 'w-[40%]' }, { contentClass: 'h-10 w-24' }]} rows={3} />,
    )
    expect(table.container.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(table.container.querySelectorAll('thead th')).toHaveLength(2)
    expect(table.container.querySelectorAll('tbody tr:first-child td')).toHaveLength(2)
  })
})

describe('storefront loading states', () => {
  it('renders a section skeleton per pending home request instead of an empty grid', async () => {
    stubFetch((url) => {
      if (url.pathname === '/api/v1/products') return never()
      return undefined
    })
    render(<MemoryRouter initialEntries={['/']}><HomePage /></MemoryRouter>)

    expect(await screen.findAllByTestId('product-section-skeleton')).toHaveLength(4)
    expect(screen.queryByText('Пока нет товаров')).toBeNull()
  })

  it('replaces the home skeletons with the loaded products', async () => {
    stubFetch((url) => {
      if (url.pathname === '/api/v1/products') return jsonResponse(page([product(1, 'loaded product')]))
      return undefined
    })
    render(<MemoryRouter initialEntries={['/']}><HomePage /></MemoryRouter>)

    expect(await screen.findAllByText('loaded product')).toHaveLength(4)
    expect(screen.queryAllByTestId('product-section-skeleton')).toHaveLength(0)
  })

  it('keeps products visible during a background refetch instead of showing skeletons again', async () => {
    const client = createTestQueryClient()
    let pending = false
    stubFetch((url) => {
      if (url.pathname !== '/api/v1/products') return undefined
      return pending ? never() : jsonResponse(page([product(1, 'cached product')]))
    })
    render(<MemoryRouter initialEntries={['/']}><HomePage /></MemoryRouter>, { client })
    expect(await screen.findAllByText('cached product')).toHaveLength(4)

    pending = true
    await act(async () => { void client.refetchQueries({ queryKey: ['/api/v1/products'] }) })

    expect(screen.getAllByText('cached product')).toHaveLength(4)
    expect(screen.queryAllByTestId('product-section-skeleton')).toHaveLength(0)
  })

  it('shows the retry state and no skeleton when a home section fails', async () => {
    stubFetch((url) => {
      if (url.pathname === '/api/v1/products') return jsonResponse({ detail: 'boom' }, 500)
      return undefined
    })
    render(<MemoryRouter initialEntries={['/']}><HomePage /></MemoryRouter>)

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThan(0)
    expect(screen.queryAllByTestId('product-section-skeleton')).toHaveLength(0)
  })

  it('renders the catalogue grid skeleton while the first page is pending', async () => {
    stubFetch((url) => {
      if (url.pathname === '/api/v1/products') return never()
      return undefined
    })
    render(<MemoryRouter initialEntries={['/catalog']}><CatalogPage /></MemoryRouter>)

    expect(await screen.findByTestId('catalog-grid-skeleton')).toBeTruthy()
    expect(screen.queryByTestId('catalog-grid')).toBeNull()
  })

  it('shows the cart skeleton while the cart request is genuinely pending, then the settled cart', async () => {
    useAccountStore.setState({ accounts: { '66': { account } }, activeAccountId: '66' })
    const cart = deferred<Response>()
    // The fixture must not answer before this handler: the request has to stay open.
    const mock = stubFetch((url) => {
      if (url.pathname === '/api/v1/cart') return cart.promise
      return undefined
    })
    render(<MemoryRouter initialEntries={['/cart']}><CartPage /></MemoryRouter>)

    expect(await screen.findByTestId('cart-skeleton')).toBeTruthy()
    expect(mock.mock.calls.some(([url]) => new URL(String(url), 'http://localhost').pathname === '/api/v1/cart')).toBe(true)
    expect(screen.queryByText('Корзина пуста')).toBeNull()

    cart.resolve(jsonResponse({ id: 1, items: [], subtotal: '0.00', item_count: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }))
    await waitFor(() => expect(screen.queryByTestId('cart-skeleton')).toBeNull())
    expect(screen.getByText('Корзина пуста')).toBeTruthy()
  })

  it('shows the product page skeleton, then the page with a review-list skeleton', async () => {
    const reviews = deferred<Response>()
    stubFetch((url) => {
      if (url.pathname === '/api/v1/products/test-product') return jsonResponse({
        ...product(1, 'Тестовый товар'), sku: 'SKU-1', description: 'Описание', stock_quantity: 3,
        characteristics: [],
        images: [], listed_at: '2026-01-01',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      })
      if (url.pathname === '/api/v1/products/1/reviews') return reviews.promise
      return undefined
    })
    render(
      <MemoryRouter initialEntries={['/products/test-product']}>
        <Routes><Route path="/products/:slug" element={<ProductPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByTestId('product-page-skeleton')).toBeTruthy()
    expect(await screen.findByText('Тестовый товар')).toBeTruthy()
    expect(screen.queryByTestId('product-page-skeleton')).toBeNull()
    expect(screen.getByTestId('product-reviews-skeleton')).toBeTruthy()

    reviews.resolve(jsonResponse({ items: [], total: 0, page: 1, page_size: 50, total_pages: 1, average_rating: 0 }))
    await waitFor(() => expect(screen.queryByTestId('product-reviews-skeleton')).toBeNull())
    expect(screen.getByText('Отзывов пока нет. Вы можете оставить первый.')).toBeTruthy()
  })

  it('renders the order history skeleton and then the empty state', async () => {
    useAccountStore.setState({ accounts: { '66': { account } }, activeAccountId: '66' })
    const orders = deferred<Response>()
    stubFetch((url) => {
      if (url.pathname === '/api/v1/cart/orders') return orders.promise
      return undefined
    })
    render(<MemoryRouter initialEntries={['/account/orders']}><OrdersPage /></MemoryRouter>)

    expect(await screen.findByTestId('orders-skeleton')).toBeTruthy()
    orders.resolve(jsonResponse([]))
    await waitFor(() => expect(screen.queryByTestId('orders-skeleton')).toBeNull())
    expect(screen.getByText('Заказов пока нет')).toBeTruthy()
  })

  it('renders the saved build skeleton and then the empty state', async () => {
    useAccountStore.setState({ accounts: { '66': { account } }, activeAccountId: '66' })
    stubFetch((url) => {
      if (url.pathname === '/api/v1/builds') return never()
      return undefined
    })
    render(<MemoryRouter initialEntries={['/builds']}><SavesPage /></MemoryRouter>)

    expect(await screen.findByTestId('saved-builds-skeleton')).toBeTruthy()
    expect(screen.queryByText('Сборок пока нет')).toBeNull()
  })

  it('shows the profile skeleton until the session is restored, not the guest panel', async () => {
    document.cookie = 'csrf_token=abc; path=/'
    const refresh = deferred<Response>()
    stubFetch((url) => {
      if (url.pathname === '/api/v1/auth/refresh') return refresh.promise
      return undefined
    })
    render(<MemoryRouter initialEntries={['/account']}><AccountPage /></MemoryRouter>)

    expect(await screen.findByTestId('account-skeleton')).toBeTruthy()
    expect(screen.queryByText('Войдите в аккаунт, чтобы управлять профилем и заказами.')).toBeNull()

    refresh.resolve(jsonResponse({ detail: 'Unauthorized' }, 401))
    await waitFor(() => expect(screen.queryByTestId('account-skeleton')).toBeNull())
    expect(screen.getByText('Войдите в аккаунт, чтобы управлять профилем и заказами.')).toBeTruthy()
  })
})

describe('administration loading boundaries', () => {
  it('shows the panel skeleton while the permission check is pending', async () => {
    useAccountStore.setState({ accounts: { '66': { account } }, activeAccountId: '66' })
    stubAdminFetch({ handler: (url) => url.pathname === '/api/v1/admin/users/66' ? never() : undefined })
    render(<MemoryRouter initialEntries={['/admin']}><Routes><Route path="/admin" element={<AdminGate />} /></Routes></MemoryRouter>)

    expect(await screen.findByTestId('admin-page-skeleton')).toBeTruthy()
    expect(screen.queryByText('Доступ запрещён')).toBeNull()
    // The gate, its table and the counters are one loading operation: one announcement.
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('never keeps the panel skeleton after access is denied', async () => {
    useAccountStore.setState({ accounts: { '66': { account } }, activeAccountId: '66' })
    stubAdminFetch({
      handler: (url) => url.pathname === '/api/v1/admin/users/66'
        ? jsonResponse({ detail: 'Administrator access required' }, 403)
        : undefined,
    })
    render(<MemoryRouter initialEntries={['/admin']}><Routes><Route path="/admin" element={<AdminGate />} /></Routes></MemoryRouter>)

    expect(await screen.findByText('Доступ запрещён')).toBeTruthy()
    expect(screen.queryByTestId('admin-page-skeleton')).toBeNull()
  })

  it('shows the products table skeleton before the first admin page arrives', async () => {
    useAccountStore.setState({ accounts: { '66': { account } }, activeAccountId: '66' })
    stubAdminFetch({
      handler: (url) => {
        if (url.pathname === '/api/v1/admin/users/66') return jsonResponse({ ...ownerFixture, id: 66 })
        if (url.pathname === '/api/v1/admin/products') return never()
        return undefined
      },
    })
    render(<MemoryRouter><AdminProductsPage /></MemoryRouter>)

    expect(await screen.findByTestId('admin-table-skeleton')).toBeTruthy()
    expect(screen.queryByText('Товары не найдены')).toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })
})
