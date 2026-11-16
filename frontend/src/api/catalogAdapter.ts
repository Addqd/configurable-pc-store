import type { PaginatedProductsOut, FilterOptionsOut, ListProductsApiV1ProductsGetParams, ProductDetailOut } from './generated/model'
import type { Product } from '../data/product'
import type { EnrichedProduct } from '../data/productDetails'
import { CATEGORY_SLUG_MAP, type FilterState } from '../data/catalogModel'

export function productFromSummary(item: PaginatedProductsOut['items'][number]): Product {
  return {
    id: item.id, slug: item.slug, name: item.name, price: Number(item.price),
    image: item.cover_image_url, category: item.category.name, type: item.product_type.name,
    manufacturer: item.manufacturer.name, color: item.color ?? undefined,
    rating: item.average_rating ?? 0, reviewCount: item.review_count ?? 0,
    specs: item.short_specs ?? [], shortSpecs: item.short_specs ?? [], addedAt: '', onSale: item.on_sale,
  }
}

export function productFromDetail(item: ProductDetailOut): EnrichedProduct {
  const summary = productFromSummary(item)
  return {
    ...summary, addedAt: item.listed_at, specs: item.spec_lines ?? [], shortSpecs: item.short_specs?.length ? item.short_specs : item.spec_lines ?? [],
    article: item.sku ?? '', description: item.description, reviews: [],
    gallery: item.images?.length ? item.images.map(image => image.url) : [item.cover_image_url],
    detailedSpecs: Object.entries(item.technical_specs ?? {}).flatMap(([label, value]) =>
      typeof value === 'string' || typeof value === 'number' ? [{ label, value: String(value) }] : []),
    stockQuantity: item.stock_quantity,
  }
}

type NamedOption = { name: string; slug: string }

/** Values that are already lowercase API slugs (deep links) can be forwarded without metadata. */
const API_SLUG = /^[a-z0-9][a-z0-9._-]*$/

interface ResolvedSelection {
  slugs: string[]
  /** Selected values that cannot be translated to an API slug right now. */
  unresolved: string[]
}

/**
 * The API filters by slug, while the drawer stores display names. Display names
 * are only translatable through `/products/filters`; without that metadata the
 * value is left out of the request (see `resolveCatalogQuery`) instead of being
 * sent as a name, which would match nothing and silently empty the catalogue.
 */
function resolveSelection(
  selected: readonly string[],
  options?: readonly NamedOption[],
  labelMap?: Record<string, string>,
): ResolvedSelection {
  const slugs: string[] = []
  const unresolved: string[] = []
  for (const value of selected) {
    const slug = options?.find(option => option.name === value)?.slug
      ?? (labelMap ? Object.entries(labelMap).find(([, label]) => label === value)?.[0] : undefined)
      ?? (API_SLUG.test(value) ? value : undefined)
    if (slug === undefined) { if (!unresolved.includes(value)) unresolved.push(value) }
    else if (!slugs.includes(slug)) slugs.push(slug)
  }
  return { slugs, unresolved }
}

export interface CatalogQuery {
  params: ListProductsApiV1ProductsGetParams
  /** Selected filters the request could not apply yet (metadata unavailable). */
  unresolved: { categories: string[]; types: string[]; manufacturers: string[] }
}

/**
 * Builds the product request and reports selections that could not be applied.
 * Products must stay visible when `/products/filters` fails: unresolvable
 * display names are left out of the request and surfaced to the UI, while the
 * URL keeps the user's selection so a retry applies it again.
 */
export function resolveCatalogQuery(filters: FilterState, query: string, page: number, options?: FilterOptionsOut): CatalogQuery {
  const categories = resolveSelection(filters.categories, options?.categories, CATEGORY_SLUG_MAP)
  const types = resolveSelection(filters.types, options?.types)
  const manufacturers = resolveSelection(filters.manufacturers, options?.manufacturers)
  return {
    params: {
      page, page_size: 49, q: query || undefined,
      categories: categories.slugs.join(',') || undefined,
      types: types.slugs.join(',') || undefined,
      manufacturers: manufacturers.slugs.join(',') || undefined,
      colors: filters.colors.join(',') || undefined, sale: filters.saleOnly, sort: filters.sort,
    },
    unresolved: { categories: categories.unresolved, types: types.unresolved, manufacturers: manufacturers.unresolved },
  }
}

export function catalogParams(filters: FilterState, query: string, page: number, options?: FilterOptionsOut): ListProductsApiV1ProductsGetParams {
  return resolveCatalogQuery(filters, query, page, options).params
}
