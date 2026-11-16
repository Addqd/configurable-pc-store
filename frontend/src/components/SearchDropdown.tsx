import { useTranslation } from 'react-i18next'
import { catalogDisplay } from '../i18n/catalogDisplay'
import { useUIStore } from '../stores/uiStore'
import { useListProductsApiV1ProductsGet, useSearchSuggestionsApiV1ProductsSearchSuggestionsGet } from '../api/generated/client'
import { useDebouncedValue } from '../utils/useDebouncedValue'
import { HiMiniChevronRight } from 'react-icons/hi2'
import { formatPrice } from '../utils/formatPrice'

/** Typing must not issue a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 250

export function SearchDropdown() {
  const { t } = useTranslation()
  const { searchQuery, closeSearch } = useUIStore()
  const trimmed = searchQuery.trim()
  const debouncedQuery = useDebouncedValue(trimmed, SEARCH_DEBOUNCE_MS)
  // Both requests always share the same settled term. Each term is its own query
  // key, so a slow response for an older term can never overwrite newer results.
  const enabled = !!debouncedQuery
  const suggestions = useSearchSuggestionsApiV1ProductsSearchSuggestionsGet({ q: debouncedQuery, limit: 5 }, { query: { enabled } })
  const count = useListProductsApiV1ProductsGet({ q: debouncedQuery, page_size: 1 }, { query: { enabled } })
  // While a newer term is still being debounced the settled term's data does not
  // describe what the input shows, so results and counts are hidden until it settles.
  const isSettling = trimmed !== debouncedQuery
  const results = isSettling ? [] : suggestions.data ?? []
  const total = isSettling ? null : count.data?.total ?? null
  if (!trimmed) return null
  return (
    <div className="w-full bg-surface rounded-xl border border-border shadow-[0_8px_30px_var(--color-shadow-md)] py-4" onMouseDown={(e) => e.stopPropagation()} onMouseUp={(e) => e.stopPropagation()}>
      <div className="px-4 mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">{t('header.search_results')}</span>
        <a href={`/catalog?q=${encodeURIComponent(searchQuery)}`} className="text-sm text-primary hover:underline" onClick={closeSearch}>
          {total === null ? t('header.show_all_no_count') : t('header.show_all', { count: total })} <HiMiniChevronRight className="w-3.5 h-3.5 inline" />
        </a>
      </div>
      <div className="px-2 space-y-1">
        {results.slice(0, 5).map((product) => (
          <a key={product.id} href={`/products/${product.slug}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-3 transition-colors" onClick={closeSearch}>
            <img src={product.cover_image_url} alt={catalogDisplay(product.name)} className="w-12 h-12 rounded-lg object-cover bg-surface-3" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{catalogDisplay(product.name)}</p>
            </div>
            <span className="text-sm font-semibold text-text-primary shrink-0">{formatPrice(Number(product.price))}</span>
          </a>
        ))}
        {isSettling || suggestions.isLoading ? <div role="status" className="px-4 py-6 text-center text-text-muted text-sm">{t('common.loading')}</div> : suggestions.isError ? <div role="alert" className="px-4 py-6 text-center text-text-muted text-sm">{t('common.load_error')}</div> : results.length === 0 && <div className="px-4 py-6 text-center text-text-muted text-sm">{t('header.search_empty')}</div>}
      </div>
    </div>
  )
}
