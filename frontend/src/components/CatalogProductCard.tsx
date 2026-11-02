import type { Product } from '../data/mockProducts'
import { useCartStore } from '../stores/cartStore'
import { formatPrice } from '../utils/formatPrice'
import { FiShoppingCart } from 'react-icons/fi'
import { Link } from 'react-router'
import { StarRating } from './StarRating'

interface CatalogProductCardProps {
  product: Product
}

export function CatalogProductCard({ product }: CatalogProductCardProps) {
  const addItem = useCartStore((s) => s.addItem)

  const handleCartClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      specs: product.specs,
      category: product.category,
    })
  }

  return (
    <div className="group flex flex-col rounded-lg border border-border bg-surface transition-colors hover:border-border-hover hover:shadow-md">
      {/* Image area */}
      <Link
        to={`/products/${product.slug}`}
        className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-t-lg bg-surface-3"
      >
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-contain p-3 transition-transform group-hover:scale-105"
          loading="lazy"
        />
      </Link>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3">
        {/* Category label */}
        <p className="mb-1 text-xs text-text-muted">
          {product.category}
        </p>

        {/* Product name */}
        <Link
          to={`/products/${product.slug}`}
          className="mb-1 text-sm font-semibold text-text-primary line-clamp-2 leading-snug hover:text-primary transition-colors"
        >
          {product.name}
        </Link>

        {/* Specs */}
        {(product.shortSpecs ?? product.specs).slice(0, 2).map((spec) => (
          <p
            key={spec}
            className="mb-0.5 text-xs text-text-muted line-clamp-1"
          >
            {spec}
          </p>
        ))}

        {/* Rating */}
        <div className="mt-1 mb-1">
          <StarRating rating={product.rating} count={product.reviewCount} />
        </div>

        {/* Price + Cart */}
        <div className="mt-auto flex items-end justify-between pt-2">
          <p className="text-base font-bold text-text-primary">
            {formatPrice(product.price)}
          </p>
          <button
            type="button"
            onClick={handleCartClick}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-surface pc-hover-icon"
            aria-label="Добавить в корзину"
          >
            <FiShoppingCart className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
