import type { Product } from './product'

export const PAGE_SIZE = 49

/** Stable keys for individual product categories, including future categories without demo fixtures. */
export const CATEGORY_SLUG_MAP: Record<string, string> = {
  prebuilt: 'Готовые сборки',
  peripheral: 'Периферия',
  accessories: 'Аксессуары',
  cooling: 'Охлаждение',
  network: 'Сетевое оборудование',
  software: 'Софт и сервисы',
  gpu: 'Видеокарты',
  cpu: 'Процессоры',
  mobo: 'Материнские платы',
  ram: 'Оперативная память',
  storage: 'Накопители',
  hdd: 'Жёсткие диски',
  case: 'Корпуса',
  psu: 'Блоки питания',
  monitor: 'Мониторы',
}

/**
 * Hamburger links that represent a SET of actual catalog checkboxes.
 * These are navigation shortcuts, never synthetic selectable product categories.
 *
 * For example, ?category=components selects the nine ordinary categories below;
 * it must not render a separate «Комплектующие» checkbox.
 */
export const CATEGORY_GROUPS: Record<string, readonly string[]> = {
  components: [
    'Видеокарты', 'Процессоры', 'Материнские платы', 'Оперативная память',
    'Накопители', 'Жёсткие диски', 'Корпуса', 'Блоки питания', 'Охлаждение',
  ],
  peripheral: ['Периферия', 'Мониторы'],
}

// This remains a derived export for other catalog consumers, not an extra checkbox.
export const COMPONENT_CATEGORIES = new Set(CATEGORY_GROUPS.components)

const REVERSE_SLUG_MAP = Object.fromEntries(
  Object.entries(CATEGORY_SLUG_MAP).map(([slug, category]) => [category, slug]),
) as Record<string, string>

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Сначала новые' },
  { value: 'oldest', label: 'Сначала старые' },
  { value: 'rating_high', label: 'По рейтингу: высокий' },
  { value: 'rating_low', label: 'По рейтингу: низкий' },
  { value: 'price_asc', label: 'По цене: дешёвые' },
  { value: 'price_desc', label: 'По цене: дорогие' },
] as const
export type SortValue = (typeof SORT_OPTIONS)[number]['value']

export interface FilterState {
  sort: SortValue
  /** Only real product categories. Never «Комплектующие» or «Акции». */
  categories: string[]
  types: string[]
  colors: string[]
  manufacturers: string[]
  /** «Акции» is a promotion filter, not a product category. */
  saleOnly: boolean
}

export const DEFAULT_FILTERS: FilterState = {
  sort: 'newest', categories: [], types: [], colors: [], manufacturers: [], saleOnly: false,
}

function commaList(params: URLSearchParams, key: string): string[] {
  return [...new Set((params.get(key) || '').split(',').map(value => value.trim()).filter(Boolean))]
}

function isSaleKey(value: string): boolean {
  return value === 'sale' || value === 'Акции'
}

/** An individual checkbox, NOT an expansion of a hamburger's group preset. */
function leafCategoryFromKey(value: string): string | null {
  return CATEGORY_SLUG_MAP[value] || (value in REVERSE_SLUG_MAP ? value : null)
}

export function readFilters(params: URLSearchParams): FilterState {
  const categories: string[] = []
  const addCategories = (values: readonly string[]) => {
    for (const value of values) if (!categories.includes(value)) categories.push(value)
  }

  const categoryKey = params.get('category') || ''
  let saleOnly = isSaleKey(categoryKey) || params.get('sale') === '1'

  // `categories` is a set of INDIVIDUAL checkbox values, even if one of the
  // values (e.g. `peripheral`) is also the name of a hamburger group preset.
  for (const value of commaList(params, 'categories')) {
    if (isSaleKey(value)) { saleOnly = true; continue }
    if (value === 'components' || value === 'Комплектующие') {
      addCategories(CATEGORY_GROUPS.components) // backwards compatibility
      continue
    }
    const leaf = leafCategoryFromKey(value)
    if (leaf) addCategories([leaf])
  }

  if (categoryKey === 'Комплектующие' || categoryKey === 'components') {
    addCategories(CATEGORY_GROUPS.components)
  } else if (CATEGORY_GROUPS[categoryKey]) {
    addCategories(CATEGORY_GROUPS[categoryKey])
  } else {
    const leaf = leafCategoryFromKey(categoryKey)
    if (leaf) addCategories([leaf])
  }

  const rawSort = params.get('sort') || 'newest'
  return {
    sort: SORT_OPTIONS.some(option => option.value === rawSort) ? rawSort as SortValue : 'newest',
    categories,
    types: commaList(params, 'types'),
    colors: commaList(params, 'colors'),
    manufacturers: commaList(params, 'manufacturers'),
    saleOnly,
  }
}

function matchesExactGroup(categories: readonly string[], group: readonly string[]): boolean {
  return categories.length === group.length && group.every(category => categories.includes(category))
}

export function writeFilters(filters: FilterState, query: string, page = 1): URLSearchParams {
  const params = new URLSearchParams()
  if (query.trim()) params.set('q', query.trim())

  if (filters.categories.length > 0) {
    if (matchesExactGroup(filters.categories, CATEGORY_GROUPS.components)) {
      params.set('category', 'components')
    } else if (matchesExactGroup(filters.categories, CATEGORY_GROUPS.peripheral)) {
      params.set('category', 'peripheral')
    } else if (filters.categories.length === 1 && filters.categories[0] !== 'Периферия') {
      params.set('category', REVERSE_SLUG_MAP[filters.categories[0]] || filters.categories[0])
    } else {
      // One «Периферия» checkbox must not be confused with the whole
      // peripheral+monitor group, which uses category=peripheral.
      params.set('categories', filters.categories.map(value => REVERSE_SLUG_MAP[value] || value).join(','))
    }
  }

  if (filters.saleOnly) {
    if (filters.categories.length === 0) params.set('category', 'sale')
    else params.set('sale', '1')
  }
  if (filters.types.length) params.set('types', filters.types.join(','))
  if (filters.colors.length) params.set('colors', filters.colors.join(','))
  if (filters.manufacturers.length) params.set('manufacturers', filters.manufacturers.join(','))
  if (filters.sort !== 'newest') params.set('sort', filters.sort)
  if (page > 1) params.set('page', String(page))
  return params
}

export function getCategoryProducts(products: readonly Product[], categories: readonly string[]): Product[] {
  return categories.length ? products.filter(product => categories.includes(product.category)) : [...products]
}

export function deriveFilterOptions(products: readonly Product[], filters: FilterState) {
  const realCategories = [...new Set(products.map(product => product.category))]
  // Keep valid future/deep-linked categories visible and removable even when
  // there are zero mock products. Never expose virtual group names as checkboxes.
  const categories = [...new Set([...realCategories, ...filters.categories])]
    .sort((a, b) => a.localeCompare(b, 'ru'))
  const byCategory = getCategoryProducts(products, filters.categories)
  const types = [...new Set(byCategory.map(product => product.type))]
    .sort((a, b) => a.localeCompare(b, 'ru'))
  const byType = filters.types.length
    ? byCategory.filter(product => filters.types.includes(product.type))
    : byCategory
  const colors = [...new Set(byType.map(product => product.color).filter((value): value is string => !!value))]
    .sort((a, b) => a.localeCompare(b, 'ru'))
  const manufacturers = [...new Set(byType.map(product => product.manufacturer))]
    .sort((a, b) => a.localeCompare(b, 'ru'))
  return { categories, types, colors, manufacturers, unavailableCategories: filters.categories.filter(cat => !realCategories.includes(cat)) }
}

export function filterCatalog(products: readonly Product[], filters: FilterState, searchQuery: string): Product[] {
  const query = searchQuery.trim().toLocaleLowerCase('ru-RU')
  let result = products.filter(product => {
    if (query && ![
      product.name, product.category, product.type, product.manufacturer,
      product.graphicsChipBrand || '', product.color || '', ...product.specs,
    ].some(value => value.toLocaleLowerCase('ru-RU').includes(query))) return false
    if (filters.categories.length && !filters.categories.includes(product.category)) return false
    // There are deliberately no special-offer fixtures yet. The «Акции» link
    // must give an honest empty state, not accidentally show every product.
    if (filters.saleOnly && !product.onSale) return false
    if (filters.types.length && !filters.types.includes(product.type)) return false
    if (filters.colors.length && !filters.colors.includes(product.color || '')) return false
    if (filters.manufacturers.length && !filters.manufacturers.includes(product.manufacturer)) return false
    return true
  })
  result = [...result]
  switch (filters.sort) {
    // Explicit fixture insertion dates, not actual product release dates.
    case 'newest': result.sort((a,b) => b.addedAt.localeCompare(a.addedAt) || b.id-a.id); break
    case 'oldest': result.sort((a,b) => a.addedAt.localeCompare(b.addedAt) || a.id-b.id); break
    case 'rating_high': result.sort((a,b) => b.rating-a.rating || b.reviewCount-a.reviewCount); break
    case 'rating_low': result.sort((a,b) => a.rating-b.rating || a.reviewCount-b.reviewCount); break
    case 'price_asc': result.sort((a,b) => a.price-b.price); break
    case 'price_desc': result.sort((a,b) => b.price-a.price); break
  }
  return result
}

export function clampPage(raw: string | null, totalCount: number): number {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  if (!raw || !/^\d+$/.test(raw)) return 1
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) ? Math.max(1, Math.min(parsed, totalPages)) : 1
}

export function getPageNumbers(currentPage: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const items: (number | '…')[] = [1]
  const from = Math.max(2, Math.min(currentPage-1, totalPages-4))
  const to = Math.min(totalPages-1, Math.max(currentPage+1, 5))
  if (from > 2) items.push('…')
  for (let n = from; n <= to; n++) items.push(n)
  if (to < totalPages-1) items.push('…')
  items.push(totalPages)
  return items
}

export function countProductLabel(count: number): string {
  const last = count % 10, lastHundred = count % 100
  if (last === 1 && lastHundred !== 11) return 'товар'
  if (last >= 2 && last <= 4 && (lastHundred < 12 || lastHundred > 14)) return 'товара'
  return 'товаров'
}

