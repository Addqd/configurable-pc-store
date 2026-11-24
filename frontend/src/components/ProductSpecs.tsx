import { catalogDisplay } from '../i18n/catalogDisplay'
import { characteristicPairs } from '../i18n/characteristics'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import type { EnrichedProduct } from '../data/productDetails'
import { FiChevronDown, FiChevronUp } from 'react-icons/fi'

interface ProductSpecsProps {
  product: EnrichedProduct
}

const COLLAPSED_LIMIT = 4

export function ProductSpecs({ product }: ProductSpecsProps) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  // Server characteristics are presented from their structured fields, so the
  // English view gets translated labels and units. Demo fixtures without them
  // keep using their prepared label/value pairs.
  const structured = product.characteristics?.filter((row) => row.showInDetails) ?? []
  const specs = structured.length > 0
    ? characteristicPairs(structured, i18n.resolvedLanguage ?? 'ru')
    : product.detailedSpecs
  const localizeLabel = (value: string) => (structured.length > 0 ? value : catalogDisplay(value))
  const visible = expanded ? specs : specs.slice(0, COLLAPSED_LIMIT)

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-text-primary">{t('product.specs')}</h2>
      {specs.length === 0 ? (
        <p className="text-sm text-text-muted">{t('product.specs_empty')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
          {visible.map((spec, index) => (
            <div key={`${product.slug}-${index}-${spec.label}`} className="flex min-w-0 items-baseline gap-2 text-sm">
              <span className="shrink-0 text-text-muted">{localizeLabel(spec.label)}</span>
              <span aria-hidden="true" className="min-w-2 flex-1 border-b border-dotted border-border" />
              <span className="max-w-[55%] break-words text-right font-medium text-text-primary">{localizeLabel(spec.value)}</span>
            </div>
          ))}
        </div>
      )}
      {specs.length > COLLAPSED_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-3"
          aria-expanded={expanded}
        >
          {expanded ? <>{t('product.specs_expanded')} <FiChevronUp className="h-4 w-4" /></> : <>{t('product.specs_collapsed')} <FiChevronDown className="h-4 w-4" /></>}
        </button>
      )}
    </section>
  )
}
