import { describe, expect, it } from 'vitest'
import { catalogParams, productFromDetail, resolveCatalogQuery } from './catalogAdapter'
import { DEFAULT_FILTERS, type FilterState } from '../data/catalogModel'
import type { ProductDetailOut } from './generated/model'

const filters = (overrides: Partial<FilterState> = {}): FilterState => ({ ...DEFAULT_FILTERS, ...overrides })

const options = {
  categories: [{ id: 1, slug: 'gpu', name: 'Видеокарты', sort_order: 0 }],
  types: [{ id: 1, category_id: 1, slug: 'type-discrete', name: 'Дискретные' }],
  colors: ['Чёрный'],
  manufacturers: [{ id: 1, slug: 'asus', name: 'ASUS' }],
}

describe('catalog query parameters', () => {
  it('translates display names to API slugs when filter metadata is available', () => {
    const { params, unresolved } = resolveCatalogQuery(
      filters({ categories: ['Видеокарты'], types: ['Дискретные'], manufacturers: ['ASUS'], colors: ['Чёрный'], sort: 'price_asc' }),
      'rtx', 3, options,
    )
    expect(params).toMatchObject({
      page: 3, q: 'rtx', categories: 'gpu', types: 'type-discrete', manufacturers: 'asus', colors: 'Чёрный', sort: 'price_asc',
    })
    expect(unresolved).toEqual({ categories: [], types: [], manufacturers: [] })
  })

  it('never sends display names as slugs when filter metadata is unavailable', () => {
    const { params, unresolved } = resolveCatalogQuery(
      filters({ categories: ['Видеокарты'], types: ['Дискретные'], manufacturers: ['ASUS'], colors: ['Чёрный'], sort: 'price_desc' }),
      'rtx', 2,
    )
    // A name sent as a slug would match nothing and silently empty the catalogue.
    expect(params.types).toBeUndefined()
    expect(params.manufacturers).toBeUndefined()
    // What can be resolved locally (known category labels, colours, paging, sorting) is kept.
    expect(params).toMatchObject({ page: 2, q: 'rtx', categories: 'gpu', colors: 'Чёрный', sort: 'price_desc' })
    expect(unresolved).toEqual({ categories: [], types: ['Дискретные'], manufacturers: ['ASUS'] })
    expect(catalogParams(filters({ types: ['Дискретные'] }), '', 1)?.types).toBeUndefined()
  })

  it('keeps deep-linked values that already are API slugs', () => {
    const { params, unresolved } = resolveCatalogQuery(
      filters({ types: ['type-discrete'], manufacturers: ['asus', 'be-quiet'] }), '', 1,
    )
    expect(params.types).toBe('type-discrete')
    expect(params.manufacturers).toBe('asus,be-quiet')
    expect(unresolved).toEqual({ categories: [], types: [], manufacturers: [] })
  })

  it('reports an unknown category instead of forwarding a display label', () => {
    const { params, unresolved } = resolveCatalogQuery(filters({ categories: ['Неизвестная категория'] }), '', 1)
    expect(params.categories).toBeUndefined()
    expect(unresolved.categories).toEqual(['Неизвестная категория'])
  })

  it('keeps sale and default sorting behaviour intact', () => {
    expect(catalogParams(filters({ saleOnly: true }), '', 1)).toMatchObject({ sale: true, sort: 'newest', q: undefined })
  })
})

const detailFixture = (overrides: Partial<ProductDetailOut> = {}): ProductDetailOut => ({
  id: 1, sku: 'SKU-1', slug: 'gpu-x', name: 'GPU X', description: 'Импортированное описание',
  price: '100.00', stock_quantity: 3, color: null, graphics_chip_brand: 'NVIDIA',
  spec_lines: ['12 ГБ GDDR6X'], short_specs: ['12 ГБ GDDR6X'],
  technical_specs: { length_mm: 300, socket: 'AM5' },
  display_specs: [
    { label: 'Объём видеопамяти', value: '12 ГБ' },
    { label: 'Разрядность шины', value: '192 бит' },
  ],
  on_sale: false, is_active: true, listed_at: '2026-01-01',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  category: { id: 1, slug: 'gpu', name: 'Видеокарты', sort_order: 0 },
  product_type: { id: 1, category_id: 1, slug: 'gpu-discrete', name: 'Дискретные' },
  manufacturer: { id: 1, slug: 'msi', name: 'MSI' },
  cover_image_url: '/api/v1/assets/product-placeholder.jpg', images: [],
  average_rating: 4.5, review_count: 2,
  ...overrides,
})

describe('product detail mapping', () => {
  it('maps display_specs to detailedSpecs in the imported order', () => {
    const detail = productFromDetail(detailFixture())
    expect(detail.detailedSpecs).toEqual([
      { label: 'Объём видеопамяти', value: '12 ГБ' },
      { label: 'Разрядность шины', value: '192 бит' },
    ])
    expect(detail.description).toBe('Импортированное описание')
    // Compatibility-engine keys stay internal.
    expect(detail.detailedSpecs.some(spec => spec.label === 'length_mm' || spec.label === 'socket')).toBe(false)
  })

  it('ignores blank or malformed display_specs rows and handles an empty array', () => {
    expect(productFromDetail(detailFixture({ display_specs: [] })).detailedSpecs).toEqual([])
    expect(productFromDetail(detailFixture({
      display_specs: [
        { label: '  Сокет  ', value: '  AM5  ' },
        { label: '', value: 'нет подписи' },
        { label: 'Пустое значение', value: '   ' },
        { label: 'Шина', value: '192 бит' },
      ],
    })).detailedSpecs).toEqual([
      { label: 'Сокет', value: 'AM5' },
      { label: 'Шина', value: '192 бит' },
    ])
  })

  it('keeps gallery order, server alt text and the cover fallback', () => {
    const withImages = productFromDetail(detailFixture({
      images: [
        { url: '/images/cover.jpg', alt_text: 'MSI RTX 4070, вид спереди', sort_order: 0 },
        { url: '/images/back.jpg', alt_text: null, sort_order: 1 },
      ],
      cover_image_url: '/images/cover.jpg',
    }))
    expect(withImages.gallery).toEqual([
      { url: '/images/cover.jpg', alt: 'MSI RTX 4070, вид спереди' },
      { url: '/images/back.jpg', alt: 'GPU X' },
    ])
    expect(productFromDetail(detailFixture()).gallery).toEqual([
      { url: '/api/v1/assets/product-placeholder.jpg', alt: 'GPU X' },
    ])
  })
})
