import { vi } from 'vitest'
import { mockProducts } from './data/mockProducts'
import { CATEGORY_SLUG_MAP } from './data/catalogModel'
import { CATALOG_CATEGORY_MAP, type BuilderCategory } from './stores/builderStore'

export const getProductsForCategory = (category: BuilderCategory) => mockProducts.filter(product => product.category === CATALOG_CATEGORY_MAP[category])

const categories = Object.entries(CATEGORY_SLUG_MAP).map(([slug, name], index) => ({ id: index + 1, slug, name, sort_order: index }))
const products = mockProducts.map(product => {
  const category = categories.find(item => item.name === product.category)!
  return { id: product.id, slug: product.slug, name: product.name, price: product.price.toFixed(2), color: product.color ?? null,
    graphics_chip_brand: product.graphicsChipBrand ?? null, short_specs: product.shortSpecs ?? product.specs, on_sale: !!product.onSale, is_active: true, cover_image_url: '/placeholder.jpg', images: [],
    average_rating: product.rating, review_count: product.reviewCount, category,
    product_type: { id: product.id, category_id: category.id, slug: `type-${product.id}`, name: product.type },
    manufacturer: { id: product.id, slug: `maker-${product.id}`, name: product.manufacturer },
    details: product,
  }
})
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

export function mockCatalogFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    const params = url.searchParams
    const requested = (params.get('categories') || params.get('category') || '').split(',').filter(Boolean)
    const selected = products.filter(product => (!requested.length || requested.includes(product.category.slug)) &&
      (!params.get('q') || product.name.toLowerCase().includes(params.get('q')!.toLowerCase())) &&
      (params.get('sale') !== 'true' || product.on_sale))
    if (url.pathname === '/api/v1/products/filters') return response({ categories, types: selected.map(p => p.product_type), colors: [], manufacturers: selected.map(p => p.manufacturer) })
    if (url.pathname === '/api/v1/products') {
      const page = Number(params.get('page') || 1), pageSize = Number(params.get('page_size') || 49)
      return response({ items: selected.slice((page - 1) * pageSize, page * pageSize), total: selected.length, page, page_size: pageSize, total_pages: Math.max(1, Math.ceil(selected.length / pageSize)) })
    }
    if (url.pathname === '/api/v1/products/search/suggestions') return response(selected.slice(0, 5))
    const slug = url.pathname.match(/^\/api\/v1\/products\/([^/]+)$/)?.[1]
    if (slug) {
      const product = products.find(item => item.slug === slug)
      if (!product) return response({ detail: 'Not found' }, 404)
      return response({ ...product, description: 'Server description', stock_quantity: 5, spec_lines: product.details.specs, short_specs: product.details.shortSpecs ?? [], technical_specs: {}, listed_at: '2026-01-01', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })
    }
    if (/\/reviews$/.test(url.pathname)) return response({ items: [], total: 0, page: 1, page_size: 50, total_pages: 1, average_rating: 0 })
    return response({ detail: 'Not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
