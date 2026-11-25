import { vi } from 'vitest'
import { mockProducts } from './data/mockProducts'
import { CATEGORY_SLUG_MAP } from './data/catalogModel'
import { CATALOG_CATEGORY_MAP, type BuilderCategory } from './stores/builderStore'

export const getProductsForCategory = (category: BuilderCategory) => mockProducts.filter(product => product.category === CATALOG_CATEGORY_MAP[category])

const categories = Object.entries(CATEGORY_SLUG_MAP).map(([slug, name], index) => ({ id: index + 1, slug, name, sort_order: index }))

/** Option ids of the test fixtures, keyed by the characteristic `code`. */
const fixtureOptionId = (code: string, index: number) => 900 + index + code.length

/** API-shaped characteristic rows for a fixture product. */
const characteristicRows = (product: (typeof mockProducts)[number]) => (product.characteristics ?? []).map((item, index) => {
  const values = Array.isArray(item.value)
    ? item.value.filter((value): value is string => typeof value === 'string')
    : [item.displayValue]
  return {
    code: item.code, name: item.name, data_type: item.dataType, editor: 'select', unit: item.unit ?? null,
    sort_order: index, is_required: false, show_in_short: item.showInShort, show_in_details: item.showInDetails,
    value: item.value, display_value: item.displayValue,
    // The dictionary selection is explicit, exactly like the server contract.
    options: values.map((value, position) => ({
      option_id: fixtureOptionId(item.code, position),
      value: String(value),
      quantity: 1,
    })),
  }
})

/** API-shaped characteristic row for a hand-written test detail fixture. */
const fixtureCharacteristic = (
  code: string,
  name: string,
  dataType: string,
  unit: string | null,
  sortOrder: number,
  value: unknown,
  display: string,
) => ({
  code, name, data_type: dataType, editor: 'select', unit, sort_order: sortOrder,
  is_required: false, show_in_short: false, show_in_details: true, value, display_value: display,
  options: [{ option_id: fixtureOptionId(code, 0), value: display, quantity: 1 }],
})

const products = mockProducts.map(product => {
  const category = categories.find(item => item.name === product.category)!
  const rows = characteristicRows(product)
  return { id: product.id, slug: product.slug, name: product.name, price: product.price.toFixed(2), color: product.color ?? null,
    graphics_chip_brand: product.graphicsChipBrand ?? null, short_characteristics: rows.filter(row => row.show_in_short),
    on_sale: !!product.onSale, is_active: true, cover_image_url: '/placeholder.jpg', images: [],
    average_rating: product.rating, review_count: product.reviewCount, category,
    product_type: { id: product.id, category_id: category.id, slug: `type-${product.id}`, name: product.type },
    manufacturer: { id: product.id, slug: `maker-${product.id}`, name: product.manufacturer },
    characteristics: rows,
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
      return response({ ...product, sku: 'SKU-TEST-13', description: 'Server description', stock_quantity: 5,
        characteristics: product.characteristics.length ? product.characteristics : [
          fixtureCharacteristic('cache_l3_mb', 'Кэш L3', 'number', 'МБ', 0, 32, '32 МБ'),
          fixtureCharacteristic('cpu_process', 'Техпроцесс', 'string', null, 1, '5 нм', '5 нм'),
          fixtureCharacteristic('integrated_graphics', 'Встроенная графика', 'string', null, 2, 'Radeon Graphics', 'Radeon Graphics'),
          fixtureCharacteristic('delivery_type', 'Тип поставки', 'string', null, 3, 'Box', 'Box'),
          fixtureCharacteristic('warranty', 'Гарантия', 'string', null, 4, '36 месяцев', '36 месяцев'),
          fixtureCharacteristic('max_temperature_c', 'Максимальная температура', 'number', '°C', 5, 95, '95 °C'),
        ], listed_at: '2026-01-01', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })
    }
    if (/\/reviews$/.test(url.pathname)) return response({ items: [], total: 0, page: 1, page_size: 50, total_pages: 1, average_rating: 0 })
    return response({ detail: 'Not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
