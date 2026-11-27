import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import App from './App'
import { queryClient } from './api/queryClient'
import { setAccessToken } from './api/transport'
import { useAccountStore } from './stores/accountStore'
import { useUIStore } from './stores/uiStore'
import { useCurrencyStore } from './stores/currencyStore'
import { useThemeStore } from './stores/themeStore'
import { i18n } from './i18n'
import { render } from './test-utils'

vi.mock('./components/Header', () => ({ Header: () => <header data-testid="header" /> }))
vi.mock('./components/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }))
vi.mock('./components/WhyChooseUs', () => ({ WhyChooseUs: () => <div /> }))
vi.mock('./components/PromotionalBanner', () => ({ PromotionalBanner: () => <div /> }))

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const product = (id: number, name: string) => ({
  id, slug: `product-${id}`, name, price: '19990.00',
  short_characteristics: [], color: null, graphics_chip_brand: null, on_sale: false, is_active: true,
  cover_image_url: '/placeholder.png', images: [], average_rating: 4.5, review_count: 2,
  category: { id: 1, slug: 'gpu', name: 'Видеокарты', sort_order: 0 },
  product_type: { id: 1, category_id: 1, slug: 'type-gpu', name: 'Видеокарты' },
  manufacturer: { id: 1, slug: 'maker', name: 'Maker' },
})
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 49, total_pages: 1 })
const filters = { categories: [], types: [], colors: [], manufacturers: [] }

type Handler = (url: URL) => Response | undefined

function stubFetch(handler: Handler) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    return handler(url) ?? json({ detail: 'Not found' }, 404)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

const sessionCalls = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.filter(([url]) => String(url).includes('/api/v1/auth/')).length

beforeEach(async () => {
  await i18n.changeLanguage('ru')
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
  useUIStore.setState({ authModalOpen: false })
  useCurrencyStore.setState({ currency: 'RUB' })
  useThemeStore.setState({ isDark: false })
  setAccessToken(null)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  queryClient.clear()
  document.documentElement.classList.remove('dark')
  document.documentElement.lang = 'ru'
})

describe('fullscreen error routing', () => {
  it('replaces an unmatched URL with the fullscreen 404 and keeps the address', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.pathname === '/api/v1/products/filters') return json(filters)
      if (url.pathname === '/api/v1/products') return json(page([]))
    })
    window.history.pushState({}, '', '/this/route/does/not/exist')
    render(<App />)

    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Страница не найдена')
    expect(screen.getByText('404')).toBeTruthy()
    // The storefront chrome and the admin navigation never wrap the error page.
    expect(screen.queryByTestId('header')).toBeNull()
    expect(screen.queryByTestId('footer')).toBeNull()
    expect(window.location.pathname).toBe('/this/route/does/not/exist')
    // A guest can read the error page without the app asking for a session.
    expect(sessionCalls(fetchMock)).toBe(0)
  })

  it('returns to a working storefront page from the error page', async () => {
    stubFetch((url) => {
      if (url.pathname === '/api/v1/products/filters') return json(filters)
      if (url.pathname === '/api/v1/products') return json(page([product(1, 'Visible GPU')]))
    })
    window.history.pushState({}, '', '/broken-entry')
    render(<App />)
    expect(await screen.findByText('404')).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: 'На главную' }))

    expect(await screen.findByTestId('header')).toBeTruthy()
    expect(screen.queryByText('404')).toBeNull()
    expect(window.location.pathname).toBe('/')
  })

  it('never lets the authentication modal cover the error page', async () => {
    stubFetch(() => undefined)
    window.history.pushState({}, '', '/missing-page')
    useUIStore.setState({ authModalOpen: true })
    render(<App />)

    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('still opens the authentication modal on a normal page', async () => {
    stubFetch((url) => {
      if (url.pathname === '/api/v1/products/filters') return json(filters)
      if (url.pathname === '/api/v1/products') return json(page([]))
    })
    window.history.pushState({}, '', '/catalog')
    useUIStore.setState({ authModalOpen: true })
    render(<App />)

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })
})

describe('error statuses stay out of unrelated failures', () => {
  it('keeps an HTTP 401 answer local instead of redirecting or replacing the page', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.pathname === '/api/v1/products/filters') return json({ detail: 'Unauthorized' }, 401)
      if (url.pathname === '/api/v1/products') return json({ detail: 'Unauthorized' }, 401)
    })
    window.history.pushState({}, '', '/catalog')
    render(<App />)

    // The page keeps its own error state; give the app-level retry time to settle so a
    // redirect or a page replacement would already have happened.
    await new Promise((resolve) => setTimeout(resolve, 2500))
    expect(window.location.pathname).toBe('/catalog')
    expect(screen.getByTestId('header')).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
    // No token means no session to restore: a 401 must not start a login loop.
    expect(sessionCalls(fetchMock)).toBe(0)
  })

  it('keeps the catalogue usable when the currency rates are unavailable', async () => {
    useCurrencyStore.setState({ currency: 'USD' })
    stubFetch((url) => {
      if (url.pathname === '/api/v1/products/filters') return json(filters)
      if (url.pathname === '/api/v1/products') return json(page([product(1, 'Visible GPU')]))
      if (url.pathname === '/api/v1/currency/rates') return json({ detail: 'unavailable' }, 503)
    })
    window.history.pushState({}, '', '/catalog')
    render(<App />)

    expect(await screen.findByTestId('catalog-grid')).toBeTruthy()
    expect(screen.getByText('Visible GPU')).toBeTruthy()
    // The RUB fallback stays in place; no fullscreen page replaces a working shop.
    expect(screen.getByText(/19\s*990/)).toBeTruthy()
    expect(screen.queryByText('Приносим извинения')).toBeNull()
  })
})

describe('theme and language survive the error page', () => {
  it('keeps the Obsidian theme and the English interface after navigating home', async () => {
    await i18n.changeLanguage('en')
    useThemeStore.setState({ isDark: true })
    stubFetch((url) => {
      if (url.pathname === '/api/v1/products/filters') return json(filters)
      if (url.pathname === '/api/v1/products') return json(page([product(1, 'Visible GPU')]))
    })
    window.history.pushState({}, '', '/gone')
    render(<App />)

    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Page not found')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    fireEvent.click(screen.getByRole('link', { name: 'Home' }))

    expect(await screen.findByTestId('header')).toBeTruthy()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.lang).toBe('en')
    expect(i18n.language).toBe('en')
  })
})
