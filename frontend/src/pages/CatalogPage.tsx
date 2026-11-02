import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router'
import { FiFilter } from 'react-icons/fi'
import { mockProducts, type Product } from '../data/mockProducts'
import { CatalogProductCard } from '../components/CatalogProductCard'
import { FilterDrawer, type FilterState } from '../components/FilterDrawer'
import { Header } from '../components/Header'

const PAGE_SIZE = 49

// Mapping from URL category slug to actual product category name
const CATEGORY_SLUG_MAP: Record<string, string> = {
  prebuilt: 'Готовые сборки',
  components: 'Комплектующие',
  peripheral: 'Периферия',
  accessories: 'Аксессуары',
  cooling: 'Охлаждение',
  network: 'Сетевое оборудование',
  software: 'Софт и сервисы',
  sale: 'Акции',
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

// Parse URL search params into filter state
function parseFilters(searchParams: URLSearchParams): FilterState {
  const sort = searchParams.get('sort') || 'newest'

  // Support both 'categories' (comma-separated Russian names) and 'category' (slug)
  const categorySlug = searchParams.get('category')
  const categoriesParam = searchParams.get('categories')
  const categories: string[] = []
  if (categoriesParam) {
    categories.push(...categoriesParam.split(',').filter(Boolean))
  }
  if (categorySlug) {
    const mapped = CATEGORY_SLUG_MAP[categorySlug]
    if (mapped && !categories.includes(mapped)) {
      categories.push(mapped)
    }
  }

  const types = searchParams.get('types')?.split(',').filter(Boolean) || []
  const colors = searchParams.get('colors')?.split(',').filter(Boolean) || []
  const manufacturers = searchParams.get('manufacturers')?.split(',').filter(Boolean) || []

  return {
    sort,
    categories,
    types,
    colors,
    manufacturers,
  }
}

// Serialize filter state to URL params
function buildSearchParams(
  filters: FilterState,
  q: string,
  page: number,
  _totalCount: number,
): URLSearchParams {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (filters.categories.length > 0) params.set('categories', filters.categories.join(','))
  if (filters.types.length > 0) params.set('types', filters.types.join(','))
  if (filters.colors.length > 0) params.set('colors', filters.colors.join(','))
  if (filters.manufacturers.length > 0) params.set('manufacturers', filters.manufacturers.join(','))
  if (filters.sort !== 'newest') params.set('sort', filters.sort)
  if (page > 1) params.set('page', String(page))
  return params
}

// Apply sorting to products
function sortProducts(products: Product[], sort: string): Product[] {
  const sorted = [...products]
  switch (sort) {
    case 'newest':
      // Use product ID as proxy for newest (higher ID = newer)
      sorted.sort((a, b) => b.id - a.id)
      break
    case 'oldest':
      sorted.sort((a, b) => a.id - b.id)
      break
    case 'rating_high':
      sorted.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
      break
    case 'rating_low':
      sorted.sort((a, b) => a.rating - b.rating || a.reviewCount - b.reviewCount)
      break
    case 'price_asc':
      sorted.sort((a, b) => a.price - b.price)
      break
    case 'price_desc':
      sorted.sort((a, b) => b.price - a.price)
      break
    default:
      break
  }
  return sorted
}

// Apply all filters to products
function applyFilters(
  products: Product[],
  filters: FilterState,
  searchQuery: string,
): Product[] {
  let result = products

  // Search
  if (searchQuery.trim()) {
    const normalized = searchQuery.trim().toLocaleLowerCase('ru-RU')
    result = result.filter((product) =>
      [
        product.name,
        product.category,
        product.manufacturer,
        product.type,
        product.graphicsChipBrand ?? '',
        product.color ?? '',
        ...product.specs,
      ].some((field) => field.toLocaleLowerCase('ru-RU').includes(normalized)),
    )
  }

  // Category
  if (filters.categories.length > 0) {
    result = result.filter((p) => filters.categories.includes(p.category))
  }

  // Type
  if (filters.types.length > 0) {
    result = result.filter((p) => filters.types.includes(p.type))
  }

  // Color
  if (filters.colors.length > 0) {
    result = result.filter((p) => filters.colors.includes(p.color ?? ''))
  }

  // Manufacturer
  if (filters.manufacturers.length > 0) {
    result = result.filter((p) => filters.manufacturers.includes(p.manufacturer))
  }

  // Sort
  result = sortProducts(result, filters.sort)

  return result
}

function generatePagination(currentPage: number, totalCount: number): (number | '...')[] {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const pages: (number | '...')[] = []

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i)
    }
  } else {
    pages.push(1)
    if (currentPage > 3) pages.push('...')
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i)
    }
    if (currentPage < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }

  return pages
}

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [filtersOpen, setFiltersOpen] = useState(false)
  const [draftFilters, setDraftFilters] = useState<FilterState>(() => parseFilters(searchParams))
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(() => parseFilters(searchParams))
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')

  // Sync applied filters when URL changes externally (Back/Forward)
  useEffect(() => {
    const q = searchParams.get('q') || ''
    setSearchQuery(q)
    setAppliedFilters(parseFilters(searchParams))
    setDraftFilters(parseFilters(searchParams))
    setFiltersOpen(false)
  }, [searchParams])

  // Derive filtered products
  const allProducts = useMemo(() => mockProducts, [])
  const filteredProducts = useMemo(
    () => applyFilters(allProducts, appliedFilters, searchQuery),
    [allProducts, appliedFilters, searchQuery],
  )

  const resultCount = filteredProducts.length
  const totalPages = Math.max(1, Math.ceil(resultCount / PAGE_SIZE))

  // Clamp page to valid range
  const currentPage = Math.max(1, Math.min(parseInt(searchParams.get('page') || '1') || 1, totalPages))

  // Paginated products
  const pageProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredProducts.slice(start, start + PAGE_SIZE)
  }, [filteredProducts, currentPage])

  const pagination = useMemo(() => generatePagination(currentPage, resultCount), [currentPage, resultCount])

  // Filter change handler (draft)
  const handleFiltersChange = useCallback((filters: FilterState) => {
    setDraftFilters(filters)
  }, [])

  // Apply filters → update URL
  const handleApplyFilters = useCallback(() => {
    const params = buildSearchParams(draftFilters, searchQuery, 1, resultCount)
    setSearchParams(params, { replace: true })
    setAppliedFilters({ ...draftFilters })
    setFiltersOpen(false)
  }, [draftFilters, searchQuery, resultCount, setSearchParams])

  // Pagination change
  const handlePageChange = useCallback(
    (page: number) => {
      const params = buildSearchParams(appliedFilters, searchQuery, page, resultCount)
      setSearchParams(params, { replace: true })
    },
    [appliedFilters, searchQuery, resultCount, setSearchParams],
  )

  // Close filter drawer
  const handleCloseFilters = useCallback(() => {
    setFiltersOpen(false)
  }, [])

  // Keyboard handler for Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && filtersOpen) {
        setFiltersOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [filtersOpen])

  // Prevent body scroll when filters are open
  useEffect(() => {
    document.body.style.overflow = filtersOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [filtersOpen])

  // Pagination component
  const Pagination = () => {
    if (totalPages <= 1) return null

    return (
      <nav
        className="flex items-center justify-center gap-1 pt-6 pb-2"
        aria-label="Пагинация"
      >
        {/* Prev */}
        <button
          type="button"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="w-9 h-9 flex items-center justify-center rounded-md text-sm text-text-primary hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Предыдущая страница"
        >
          ‹
        </button>

        {pagination.map((page, idx) =>
          page === '...' ? (
            <span
              key={`ellipsis-${idx}`}
              className="w-9 h-9 flex items-center justify-center text-sm text-text-muted"
            >
              …
            </span>
          ) : (
            <Link
              key={page}
              to={`?${buildSearchParams(appliedFilters, searchQuery, page, resultCount)}`}
              className={`w-9 h-9 flex items-center justify-center rounded-md text-sm font-medium transition-colors ${
                page === currentPage
                  ? 'bg-primary text-white'
                  : 'text-text-primary hover:bg-surface-3'
              }`}
              onClick={(e) => e.preventDefault()}
              replace
              state={null}
            >
              {page}
            </Link>
          ),
        )}

        {/* Next */}
        <button
          type="button"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="w-9 h-9 flex items-center justify-center rounded-md text-sm text-text-primary hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Следующая страница"
        >
          ›
        </button>
      </nav>
    )
  }

  // Russian pluralization for product count
  function pluralizeProduct(count: number): string {
    const mod10 = count % 10
    const mod100 = count % 100
    if (mod10 === 1 && mod100 !== 11) return 'товар'
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'товара'
    return 'товаров'
  }

  // Empty state
  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg font-medium text-text-primary mb-2">Ничего не найдено</p>
      <p className="text-sm text-text-muted">
        Попробуйте изменить параметры фильтрации или поисковый запрос
      </p>
    </div>
  )

  return (
    <div className="min-h-screen bg-surface-2">
      <Header />

      <main className="pt-[64px]">
        {/* Toolbar */}
        <div className="max-w-[1440px] mx-auto px-4 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border bg-surface text-sm font-medium text-text-primary hover:bg-surface-3 hover:border-border-hover transition-colors"
          >
            <FiFilter className="w-4 h-4" />
            Фильтры
          </button>
          <span className="text-sm text-text-muted">
            Найдено {resultCount} {pluralizeProduct(resultCount)}
          </span>
        </div>

        {/* Product grid */}
        <div className="max-w-[1440px] mx-auto px-4 pb-4">
          {pageProducts.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3">
                {pageProducts.map((product) => (
                  <CatalogProductCard key={product.id} product={product} />
                ))}
              </div>

              {/* Pagination */}
              <Pagination />
            </>
          )}
        </div>
      </main>

      {/* Filter Drawer */}
      <FilterDrawer
        open={filtersOpen}
        filters={draftFilters}
        onFiltersChange={handleFiltersChange}
        onApply={handleApplyFilters}
        onClose={handleCloseFilters}
      />
    </div>
  )
}
