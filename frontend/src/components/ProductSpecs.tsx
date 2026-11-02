import { useState } from 'react'
import type { EnrichedProduct } from '../data/productDetails'
import { FiChevronDown, FiChevronUp } from 'react-icons/fi'

interface ProductSpecsProps {
  product: EnrichedProduct
}

const COLLAPSED_LIMIT = 4

export function ProductSpecs({ product }: ProductSpecsProps) {
  const [expanded, setExpanded] = useState(false)
  const specs = product.detailedSpecs
  const visible = expanded ? specs : specs.slice(0, COLLAPSED_LIMIT)

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-text-primary">Характеристики</h2>
      {specs.length === 0 ? (
        <p className="text-sm text-text-muted">Характеристики пока не указаны</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
          {visible.map((spec) => (
            <div key={`${product.slug}-${spec.label}`} className="flex min-w-0 items-baseline gap-2 text-sm">
              <span className="shrink-0 text-text-muted">{spec.label}</span>
              <span aria-hidden="true" className="min-w-2 flex-1 border-b border-dotted border-border" />
              <span className="max-w-[55%] break-words text-right font-medium text-text-primary">{spec.value}</span>
            </div>
          ))}
        </div>
      )}
      {specs.length > COLLAPSED_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="pc-hover-outline mt-5 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-3"
          aria-expanded={expanded}
        >
          {expanded ? <>Скрыть характеристики <FiChevronUp className="h-4 w-4" /></> : <>Все характеристики <FiChevronDown className="h-4 w-4" /></>}
        </button>
      )}
    </section>
  )
}
