import { useCartStore } from '../stores/cartStore'
import { formatPrice } from '../utils/formatPrice'

interface ProductCartItemProps {
  item: {
    id: number
    name: string
    price: number
    quantity: number
    image: string
    specs: string[]
  }
  isBuild?: false
}

export function ProductCartItem({ item }: ProductCartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)

  return (
    <div className="flex items-start gap-4 p-4 bg-surface border border-border rounded-xl">
      <img
        src={item.image}
        alt={item.name}
        className="w-24 h-24 rounded-lg object-cover bg-surface-3 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-text-primary text-sm leading-tight">
          {item.name}
        </p>
        <p className="text-xs text-text-muted mt-1">
          {item.specs.join(' · ')}
        </p>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
            В наличии
          </span>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center">
            <button
              onClick={() => updateQuantity(item.id, item.quantity - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-l-lg border border-border bg-surface-2 hover:bg-surface-3 text-text-primary text-sm font-medium transition-colors"
              aria-label="Уменьшить количество"
            >
              −
            </button>
            <span className="w-10 h-8 flex items-center justify-center border-t border-b border-border bg-surface text-sm font-medium text-text-primary">
              {item.quantity}
            </span>
            <button
              onClick={() => updateQuantity(item.id, item.quantity + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-r-lg border border-border bg-surface-2 hover:bg-surface-3 text-text-primary text-sm font-medium transition-colors"
              aria-label="Увеличить количество"
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-bold text-text-primary text-base">
              {formatPrice(item.price * item.quantity)}
            </span>
            <button
              onClick={() => removeItem(item.id)}
              className="text-text-muted hover:text-text-primary transition-colors"
              aria-label="Удалить"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
