import { useTranslation } from 'react-i18next'
import { catalogDisplay } from '../i18n/catalogDisplay'
import type { Product } from '../data/product'
import { useServerCart } from '../api/useServerCart'
import { formatPrice } from '../utils/formatPrice'
import { FiShoppingCart } from 'react-icons/fi'
import { Link } from 'react-router'
import type { ReactNode } from 'react'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const { t } = useTranslation()
  const { addProduct, add } = useServerCart()
  // Home cards should stay compact even though Product Details uses individual specs.
  const specs = product.shortSpecs ?? product.specs
  const summaryLines = specs.length > 2
    ? [specs.slice(0, 2).join(' • '), specs.slice(2, 4).join(' • ')]
    : specs

  const handleCartClick = () => {
    addProduct(product.id)
  }

  return (
    <div className="rounded-lg border border-border bg-surface transition-all hover:border-border-hover hover:shadow-md">
      <div className="flex items-center gap-3 p-3">
        <Link
          to={`/products/${product.slug}`}
          className="group flex min-w-0 flex-1 items-center gap-3"
        >
          <img
            src={product.image}
            alt={catalogDisplay(product.name)}
            className="h-16 w-16 shrink-0 rounded-md bg-surface-3 object-contain"
          />
          <div className="min-w-0 flex-1">
            <FadeOverflowLine>
              <h3 className="text-sm font-medium text-text-primary transition-colors group-hover:text-primary">
                {catalogDisplay(product.name)}
              </h3>
            </FadeOverflowLine>
            {summaryLines.map((spec) => (
              <FadeOverflowLine key={spec} className="mt-0.5">
                <p className="text-xs text-text-muted">{spec}</p>
              </FadeOverflowLine>
            ))}
            <p className="mt-1 text-sm font-semibold text-text-primary">
              {formatPrice(product.price)}
            </p>
          </div>
        </Link>
        <button
          type="button"
          onClick={handleCartClick}
          disabled={add.isPending}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary transition-colors hover:bg-primary hover:text-white dark:hover:text-[#08090C]"
          aria-label={t('product.add_to_cart')}
        >
          <FiShoppingCart className="h-4 w-4" />
        </button>
        {add.isError && <p role="alert" className="text-xs text-red-500">{t('common.load_error')}</p>}
      </div>
    </div>
  )
}

interface FadeOverflowLineProps {
  children: ReactNode
  className?: string
}

function FadeOverflowLine({ children, className = '' }: FadeOverflowLineProps) {
  return (
    <div className={`relative max-w-full overflow-hidden whitespace-nowrap pr-8 ${className}`.trim()}>
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface via-surface/90 to-transparent"
      />
    </div>
  )
}
