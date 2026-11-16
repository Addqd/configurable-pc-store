import { describe, expect, it } from 'vitest'
import { catalogParams, resolveCatalogQuery } from './catalogAdapter'
import { DEFAULT_FILTERS, type FilterState } from '../data/catalogModel'

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
