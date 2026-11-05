import { localizedDescription } from '../i18n/catalogDescription'
import { useTranslation } from 'react-i18next'
import type { EnrichedProduct } from '../data/productDetails'

interface ProductDescriptionProps {
  product: EnrichedProduct
}

export function ProductDescription({ product }: ProductDescriptionProps) {
  const { t } = useTranslation()
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="mb-3 text-lg font-bold text-text-primary">{t('product.description')}</h2>
      <p className="text-sm leading-relaxed text-text-secondary">{localizedDescription(product)}</p>
    </section>
  )
}
