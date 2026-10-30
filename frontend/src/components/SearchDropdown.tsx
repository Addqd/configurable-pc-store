import { useUIStore } from '../stores/uiStore'
import { filterProducts } from '../data/mockProducts'
import { HiMiniChevronRight } from 'react-icons/hi2'
import { formatPrice } from '../utils/formatPrice'

export function SearchDropdown() {
  const { searchQuery, closeSearch } = useUIStore()
  const trimmed = searchQuery.trim()
  const results = trimmed ? filterProducts(trimmed) : []

  if (results.length === 0 && !trimmed) return null

  return (
    <div
      className="w-full bg-surface rounded-xl border border-border shadow-[0_8px_30px_var(--color-shadow-md)] py-4"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div className="px-4 mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">Товары</span>
        <a
          href={`/catalog?q=${encodeURIComponent(searchQuery)}`}
          className="text-sm text-primary hover:underline"
          onClick={closeSearch}
        >
          Показать все ({results.length}) <HiMiniChevronRight className="w-3.5 h-3.5 inline" />
        </a>
      </div>

      <div className="px-2 space-y-1">
        {results.slice(0, 5).map((product) => (
          <a
            key={product.id}
            href={`/products/${product.slug}`}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-3 transition-colors"
            onClick={closeSearch}
          >
            <img src={product.image} alt={product.name} className="w-12 h-12 rounded-lg object-cover bg-surface-3" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{product.name}</p>
              <p className="text-xs text-text-muted">
                {product.category} · {product.manufacturer}
              </p>
            </div>
            <span className="text-sm font-semibold text-text-primary shrink-0">
              {formatPrice(product.price)}
            </span>
          </a>
        ))}
        {results.length === 0 && (
          <div className="px-4 py-6 text-center text-text-muted text-sm">
            Ничего не найдено
          </div>
        )}
      </div>
    </div>
  )
}
