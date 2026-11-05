import { useTranslation } from 'react-i18next'
import { catalogDisplay } from '../i18n/catalogDisplay'
import type { Product } from '../data/mockProducts'
import { useCartStore } from '../stores/cartStore'
import { formatPrice } from '../utils/formatPrice'
import { FiShoppingCart } from 'react-icons/fi'
import { Link } from 'react-router'
import { getProductDetail, calculateRating } from '../data/productDetails'
import { readProductReviews } from '../data/reviewStorage'

export function CatalogProductCard({ product }: { product: Product }) {
  const { t } = useTranslation()
  const addItem = useCartStore(s => s.addItem)
  const detail = getProductDetail(product.slug)
  // Share precisely the review model used on ProductPage, including persisted reviews.
  const reviews = [...readProductReviews(product.slug), ...(detail?.reviews ?? [])]
  const rating = calculateRating(reviews)
  const handleAdd = () => addItem({
    id: product.id, name: product.name, price: product.price,
    image: product.image, specs: product.specs, category: product.category,
  })
  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors hover:border-border-hover hover:shadow-md">
      {/* One accessible stretched link makes the entire card a details target; the cart button stays above it. */}
      <Link to={`/products/${product.slug}`} className="absolute inset-0 z-10 rounded-lg" aria-label={t('product.details_label', { name: catalogDisplay(product.name) })} />
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface-3">
        <img src={product.image} alt={product.name} loading="lazy" className="h-full w-full object-contain p-2" />
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        <p className="mb-0.5 truncate text-[11px] text-text-muted" title={catalogDisplay(product.category)}>{catalogDisplay(product.category)}</p>
        <p className="mb-1 min-h-[2.5rem] text-xs font-semibold leading-snug text-text-primary line-clamp-2 transition-colors group-hover:text-primary" title={catalogDisplay(product.name)}>{catalogDisplay(product.name)}</p>
        <div className="mb-1 min-h-[2rem] text-[11px] leading-4 text-text-muted">
          {(product.shortSpecs ?? product.specs).slice(0,2).map((spec,i) => <p key={`${i}-${spec}`} className="truncate" title={catalogDisplay(spec)}>{catalogDisplay(spec)}</p>)}
        </div>
        <div className="mt-auto flex min-h-5 items-center gap-1 text-[11px]" aria-label={reviews.length ? t('product.rating_label', { rating, count: reviews.length }) : t('product.no_reviews')}>
          <span className="text-amber-400" aria-hidden="true">★</span>
          {reviews.length ? <><span className="text-text-secondary">{rating.toFixed(1)}</span><span className="text-text-muted">({reviews.length})</span></> : <span className="text-text-muted">{t('product.no_reviews')}</span>}
        </div>
        <p className="mt-1 mb-1.5 whitespace-nowrap text-sm font-bold text-text-primary">{formatPrice(product.price)}</p>
        <button type="button" onClick={handleAdd} className="relative z-20 flex h-8 w-full items-center justify-center rounded-md bg-primary-light text-primary transition-colors hover:bg-primary hover:text-white dark:hover:text-[#08090C] pc-hover-icon" aria-label={t('product.add_to_cart_named', { name: catalogDisplay(product.name) })}>
          <FiShoppingCart aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </article>
  )
}
