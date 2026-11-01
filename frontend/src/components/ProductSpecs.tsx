import { useState } from 'react'
import type { EnrichedProduct } from '../data/productDetails'
import { FiChevronDown, FiChevronUp } from 'react-icons/fi'

interface ProductSpecsProps {
  product: EnrichedProduct
}

const COLLAPSED_LIMIT = 8

export function ProductSpecs({ product }: ProductSpecsProps) {
  const [expanded, setExpanded] = useState(false)
  const specs = product.detailedSpecs
  const visible = expanded ? specs : specs.slice(0, COLLAPSED_LIMIT)
  const hiddenCount = specs.length - COLLAPSED_LIMIT

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-text-primary">Характеристики</h2>

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {visible.map((spec, index) => (
          <div
            key={`${product.slug}-spec-${index}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 border-b border-border pb-2"
          >
            <span className="text-sm text-text-muted">{spec.label}</span>
            <span className="min-w-0 text-right text-sm font-medium text-text-primary">{spec.value}</span>
          </div>
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-3"
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              Скрыть
              <FiChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              Все характеристики
              <FiChevronDown className="h-4 w-4" />
            </>
          )}
        </button>
      )}
    </section>
  )
}
