import { useState, useEffect, useRef } from 'react'
import { useBuilderStore, CATEGORY_LABELS, getProductsForCategory, type BuilderCategory } from '../stores/builderStore'
import { formatPrice } from '../utils/formatPrice'
import placeholder from '../assets/placeholder.jpg'
import { FiX, FiSearch, FiCheck } from 'react-icons/fi'

interface BuilderProductSelectorProps {
  category: BuilderCategory
  onClose: () => void
}

export function BuilderProductSelector({ category, onClose }: BuilderProductSelectorProps) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const setProduct = useBuilderStore((s) => s.setProduct)
  const selections = useBuilderStore((s) => s.selections)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const products = getProductsForCategory(category)

  const filtered = products.filter((p) => {
    const q = search.trim().toLocaleLowerCase('ru-RU')
    if (!q) return true
    return (
      p.name.toLocaleLowerCase('ru-RU').includes(q) ||
      p.manufacturer.toLocaleLowerCase('ru-RU').includes(q) ||
      p.specs.some((s) => s.toLocaleLowerCase('ru-RU').includes(q))
    )
  })

  const currentProduct = selections[category]

  const handleSelect = (product: Product) => {
    setProduct(category, product)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-[720px] max-h-[80vh] overflow-hidden rounded-xl border border-border bg-surface shadow-xl flex flex-col"
        role="dialog"
        aria-label={`Выбрать ${CATEGORY_LABELS[category]}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {CATEGORY_LABELS[category]}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text-muted hover:bg-surface-3 hover:text-text-primary"
            aria-label="Закрыть"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Поиск по названию, производителю или характеристикам..."
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-border bg-surface-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-text-secondary">Ничего не найдено</p>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="mt-2 text-sm text-primary hover:underline"
                >
                  Сбросить поиск
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((product) => {
                const isSelected = currentProduct?.id === product.id
                return (
                  <button
                    key={product.id}
                    onClick={() => handleSelect(product)}
                    className={`w-full flex items-center gap-4 p-3 rounded-lg border transition-all text-left ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-border-hover hover:bg-surface-3'
                    }`}
                  >
                    {/* Image */}
                    <img
                      src={product.image || placeholder}
                      alt={product.name}
                      className="h-14 w-14 shrink-0 rounded-md bg-surface-2 object-contain"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).src = placeholder
                      }}
                    />
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {product.name}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5 truncate">
                        {product.specs.slice(0, 3).join(' · ')}
                      </p>
                      <p className="text-xs text-text-muted mt-1">
                        {product.manufacturer}
                      </p>
                    </div>
                    {/* Price */}
                    <span className="shrink-0 text-sm font-semibold text-text-primary whitespace-nowrap">
                      {formatPrice(product.price)}
                    </span>
                    {/* Check icon */}
                    {isSelected && (
                      <FiCheck className="h-5 w-5 text-primary shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-3 transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
