import { useCartStore, type RegularCartItem } from '../stores/cartStore'
import { formatPrice } from '../utils/formatPrice'
import { FiX } from 'react-icons/fi'

interface ProductCartItemProps {
  item: RegularCartItem
}

export function ProductCartItem({ item }: ProductCartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)

  return (
    <article className="flex flex-col gap-4 px-3 py-5 sm:px-4 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <img
          src={item.image}
          alt={item.name}
          className="h-28 w-28 shrink-0 rounded-lg bg-surface-3 object-contain sm:h-32 sm:w-36"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-snug text-text-primary sm:text-base">
            {item.name}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            {item.specs.join(', ')}
          </p>
          <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-emerald-500">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            В наличии
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 pl-0 sm:gap-5 md:justify-end">
        <div className="inline-flex h-10 items-center overflow-hidden rounded-lg border border-border bg-surface-2">
          <button
            type="button"
            onClick={() => updateQuantity(item.id, item.quantity - 1)}
            disabled={item.quantity <= 1}
            className="flex h-full w-9 items-center justify-center text-lg text-text-primary hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`Уменьшить количество: ${item.name}`}
          >
            −
          </button>
          <span className="flex h-full min-w-10 items-center justify-center bg-surface px-2 text-sm font-semibold text-text-primary" aria-label={`Количество: ${item.quantity}`}>
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={() => updateQuantity(item.id, item.quantity + 1)}
            className="flex h-full w-9 items-center justify-center text-lg text-text-primary hover:bg-surface-3"
            aria-label={`Увеличить количество: ${item.name}`}
          >
            +
          </button>
        </div>
        <strong className="min-w-24 text-right text-base font-bold whitespace-nowrap text-text-primary sm:text-lg">
          {formatPrice(item.price * item.quantity)}
        </strong>
        <button
          type="button"
          onClick={() => removeItem(item.id)}
          className="rounded p-1 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
          aria-label={`Удалить: ${item.name}`}
        >
          <FiX className="h-5 w-5" />
        </button>
      </div>
    </article>
  )
}
