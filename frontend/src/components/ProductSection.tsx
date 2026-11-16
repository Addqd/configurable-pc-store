import type { Product } from '../data/product'
import { useTranslation } from 'react-i18next'
import { ProductCard } from './ProductCard'
import { HiMiniArrowRight } from 'react-icons/hi2'
import { Link } from 'react-router'
import type { IconType } from 'react-icons'

interface ProductSectionProps {
  titleKey: string
  icon: IconType
  products: Product[]
  catalogUrl: string
  /** The section owns its own request, so pending/failed states are per section. */
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
}

export function ProductSection({ titleKey, icon: Icon, products, catalogUrl, isLoading = false, isError = false, onRetry }: ProductSectionProps) {
  const { t } = useTranslation()
  const cards = products.slice(0, 6)
  // Never render an empty grid for a request that has not produced its answer yet.
  const state = isError ? 'error' : isLoading ? 'loading' : cards.length ? 'ready' : 'empty'
  return <section className="py-6">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2"><Icon className="w-5 h-5 text-primary"/><h2 className="text-lg font-bold text-text-primary">{t(titleKey)}</h2></div>
      <Link to={catalogUrl} className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary-hover font-medium transition-colors shrink-0">{t('common.view_all')}<HiMiniArrowRight className="w-4 h-4" /></Link>
    </div>
    {state === 'error'
      ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-6 text-sm text-text-muted">
          <span>{t('common.load_error')}</span>
          {onRetry && <button type="button" onClick={onRetry} className="rounded-md border border-border bg-surface-3 px-3 py-1 text-sm font-medium text-text-primary hover:border-border-hover">{t('common.retry')}</button>}
        </div>
      : state === 'loading'
        ? <div role="status" className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-text-muted">{t('common.loading')}</div>
        : state === 'empty'
          ? <div role="status" className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-text-muted">{t('catalog.filter.no_products')}</div>
          : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {cards.map(product => <ProductCard key={product.id} product={product} />)}
            </div>}
  </section>
}
