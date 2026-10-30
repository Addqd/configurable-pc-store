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
    <div className="bg-surface border border-border rounded-lg hover:shadow-md hover:border-border-hover transition-all">
      <Link
        to={`/products/${product.slug}`}
        className="flex items-center gap-3 p-3 group"
      >
        <img
          src={product.image}
          alt={product.name}
          className="w-16 h-16 shrink-0 rounded-md object-cover bg-surface-3"
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-text-primary line-clamp-2 group-hover:text-primary transition-colors">
            {product.name}
          </h3>
          {product.specs.map((spec) => (
            <p key={spec} className="text-xs text-text-muted line-clamp-1 mt-0.5">
              {spec}
            </p>
          ))}
          <p className="text-sm font-semibold text-text-primary mt-1">
            {formatPrice(product.price)}
          </p>
        </div>
      </Link>
      <button
        onClick={handleCartClick}
        className="w-8 h-8 mx-3 mb-3 shrink-0 flex items-center justify-center bg-primary/5 hover:bg-primary hover:text-white rounded-md transition-colors text-primary"
        aria-label="Добавить в корзину"
      >
        <FiShoppingCart className="w-4 h-4" />
      </button>
    </div>
  )
}
