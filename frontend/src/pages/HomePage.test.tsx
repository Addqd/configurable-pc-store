import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomePage } from './HomePage'

vi.mock('../components/Header', () => ({ Header: () => <div /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div /> }))
vi.mock('../components/WhyChooseUs', () => ({ WhyChooseUs: () => <div /> }))
vi.mock('../components/PromotionalBanner', () => ({ PromotionalBanner: () => <div /> }))

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const product = (id: number, name: string) => ({
  id, slug: `product-${id}`, name, price: '1000.00', short_characteristics: [{ code: 'gpu_model', name: 'Графический процессор', data_type: 'string', editor: 'select', unit: null, sort_order: 0, is_required: false, show_in_short: true, show_in_details: true, value: 'spec', display_value: 'spec', options: [{ option_id: 601, value: 'spec', quantity: 1 }] }], color: null,
  graphics_chip_brand: null, on_sale: false, is_active: true, cover_image_url: '/placeholder.png', images: [],
  average_rating: 4, review_count: 1,
  category: { id: 1, slug: 'gpu', name: 'Видеокарты', sort_order: 0 },
  product_type: { id: 1, category_id: 1, slug: 'type', name: 'Видеокарты' },
  manufacturer: { id: 1, slug: 'maker', name: 'Maker' },
})
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, page_size: 6, total_pages: 1 })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

type Handler = (category: string | null) => Promise<Response> | Response
function stubFetch(handler: Handler) {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/v1/products') return handler(url.searchParams.get('category'))
    if (url.pathname === '/api/v1/cart') return json({ items: [], item_count: 0, subtotal: '0.00', total: '0.00' })
    return json({ detail: 'Not found' }, 404)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/']}><HomePage /></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => { window.history.pushState({}, '', '/') })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('home page product sections', () => {
  it('shows a pending section as loading instead of an empty result', async () => {
    const prebuilts = deferred<Response>()
    stubFetch((category) => {
      if (category === 'prebuilt') return prebuilts.promise
      return json(page([product(1, `${category} product`)]))
    })
    setup()

    const sections = await screen.findAllByRole('status')
    expect(sections.some(node => node.textContent === 'Загрузка...')).toBe(true)
    // A successful sibling section is not hidden by the pending one.
    expect(await screen.findByText('gpu product')).toBeTruthy()

    prebuilts.resolve(json(page([product(2, 'prebuilt product')])))
    expect(await screen.findByText('prebuilt product')).toBeTruthy()
    expect(screen.queryAllByRole('status').some(node => node.textContent === 'Загрузка...')).toBe(false)
  })

  it('keeps successful sections visible when another section fails, and retries', async () => {
    let failGpu = true
    const mock = stubFetch((category) => {
      if (category === 'gpu' && failGpu) return json({ detail: 'boom' }, 500)
      if (category === 'gpu') return json(page([product(3, 'gpu recovered')]))
      return json(page([product(1, `${category} product`)]))
    })
    setup()

    const alert = await screen.findByRole('alert', {}, { timeout: 4000 })
    expect(alert.textContent).toContain('Не удалось загрузить')
    expect(screen.getByText('cpu product')).toBeTruthy()
    expect(screen.getByText('mobo product')).toBeTruthy()

    failGpu = false
    const retry = within(alert).getByRole('button', { name: 'Повторить' })
    retry.click()

    expect(await screen.findByText('gpu recovered')).toBeTruthy()
    await waitFor(() => expect(mock.mock.calls.filter(([url]) => String(url).includes('category=gpu')).length).toBe(2))
  })

  it('distinguishes an empty successful catalogue from a pending request', async () => {
    stubFetch(() => json(page([])))
    setup()
    const empty = await screen.findAllByText('Пока нет товаров')
    expect(empty).toHaveLength(4)
  })
})
