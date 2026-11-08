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

export function catalogParams(filters: FilterState, query: string, page: number, options: FilterOptionsOut): ListProductsApiV1ProductsGetParams {
  const slugs = (selected: string[], values: { name: string; slug: string }[]) =>
    selected.flatMap(name => {
      const matches = values.filter(value => value.name === name).map(value => value.slug)
      return matches.length ? matches : [Object.entries(CATEGORY_SLUG_MAP).find(([, label]) => label === name)?.[0] ?? name]
    }).join(',')
  return {
    page, page_size: 49, q: query || undefined,
    categories: slugs(filters.categories, options.categories) || undefined,
    types: slugs(filters.types, options.types) || undefined,
    manufacturers: slugs(filters.manufacturers, options.manufacturers) || undefined,
    colors: filters.colors.join(',') || undefined, sale: filters.saleOnly, sort: filters.sort,
  }
}
