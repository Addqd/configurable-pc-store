import type { Product } from '../data/mockProducts'
import { useCartStore } from '../stores/cartStore'
import { formatPrice } from '../utils/formatPrice'
import { FiShoppingCart } from 'react-icons/fi'
import { Link } from 'react-router'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem)

  const handleCartClick = () => {
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
    <div className="rounded-lg border border-border bg-surface transition-all hover:border-border-hover hover:shadow-md">
      <div className="flex items-center gap-3 p-3">
        <Link
          to={`/products/${product.slug}`}
          className="group flex min-w-0 flex-1 items-center gap-3"
        >
          <img
            src={product.image}
            alt={product.name}
            className="h-16 w-16 shrink-0 rounded-md bg-surface-3 object-contain"
          />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-medium text-text-primary transition-colors group-hover:text-primary">
              {product.name}
            </h3>
            {product.specs.map((spec) => (
              <p key={spec} className="mt-0.5 line-clamp-1 text-xs text-text-muted">
                {spec}
              </p>
            ))}
            <p className="mt-1 text-sm font-semibold text-text-primary">
              {formatPrice(product.price)}
            </p>
          </div>
        </Link>
        <button
          type="button"
          onClick={handleCartClick}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary transition-colors hover:bg-primary hover:text-white dark:hover:text-[#08090C]"
          aria-label="Добавить в корзину"
        >
          <FiShoppingCart className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
