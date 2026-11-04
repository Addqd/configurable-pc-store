import { useState } from 'react'
import { type BuilderCategory } from '../stores/builderStore'
import { useBuilderStore, CATEGORY_LABELS } from '../stores/builderStore'
import { formatPrice } from '../utils/formatPrice'
import placeholder from '../assets/placeholder.jpg'
import { FiRefreshCw, FiTrash2, FiEdit2 } from 'react-icons/fi'
import { BuilderCategoryIcon } from './BuilderCategoryIcon'
import { BuilderProductSelector } from './BuilderProductSelector'

interface BuilderComponentRowProps {
  category: BuilderCategory
}

export function BuilderComponentRow({ category }: BuilderComponentRowProps) {
  const [showSelector, setShowSelector] = useState(false)
  const selection = useBuilderStore((s) => s.selections[category])
  const removeProduct = useBuilderStore((s) => s.removeProduct)
  const setSelectedProduct = useBuilderStore((s) => s.setProduct)

  const label = CATEGORY_LABELS[category]

  const handleReplace = () => {
    setShowSelector(true)
  }

  const handleRemove = () => {
    removeProduct(category)
  }

  const handleProductSelected = (product: Product) => {
    setSelectedProduct(category, product)
    setShowSelector(false)
  }

  // Empty state — show "Выбрать" button
  if (!selection) {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-dashed border-border bg-surface p-4 transition-colors hover:border-border-hover">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <BuilderCategoryIcon category={category} className="h-6 w-6 text-primary" />
        </div>
        <span className="flex-1 text-sm text-text-secondary">{label}</span>
        <button
          onClick={() => setShowSelector(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:bg-primary-hover"
        >
          <FiEdit2 className="h-4 w-4" />
          Выбрать
        </button>
      </div>
    )
  }

  // Selected state
  return (
    <>
      <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-hover">
        {/* Category icon */}
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <BuilderCategoryIcon category={category} className="h-6 w-6 text-primary" />
        </div>

        {/* Label */}
        <span className="min-w-[90px] text-sm text-text-secondary">{label}</span>

        {/* Product image */}
        <img
          src={selection.image || placeholder}
          alt={selection.name}
          className="h-14 w-14 shrink-0 rounded-lg bg-surface-2 object-contain"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = placeholder
          }}
        />

        {/* Product name and specs */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary truncate">
            {selection.name}
          </p>
          <p className="text-xs text-text-secondary mt-0.5 truncate">
            {selection.specs.slice(0, 3).join(' · ')}
          </p>
          {/* Availability indicator — always show as in reference */}
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-500">В наличии</span>
          </div>
        </div>

        {/* Price */}
        <span className="shrink-0 text-sm font-semibold text-text-primary whitespace-nowrap">
          {formatPrice(selection.price)}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleReplace}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-3 hover:text-text-primary transition-colors"
            aria-label={`Заменить ${label}`}
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            Заменить
          </button>
          <button
            onClick={handleRemove}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
            aria-label={`Удалить ${label}`}
          >
            <FiTrash2 className="h-3.5 w-3.5" />
            Удалить
          </button>
        </div>
      </div>

      {/* Product selector modal */}
      {showSelector && (
        <BuilderProductSelector
          category={category}
          onClose={() => setShowSelector(false)}
        />
      )}
    </>
  )
}
