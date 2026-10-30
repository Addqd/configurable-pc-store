import { useCartStore } from '../stores/cartStore'
import { formatPrice } from '../utils/formatPrice'

export function CartPage() {
  const items = useCartStore((s) => s.items)
  const totalPrice = useCartStore((s) => s.totalPrice())
  const removeItem = useCartStore((s) => s.removeItem)
  const updateQuantity = useCartStore((s) => s.updateQuantity)

  return (
    <div className="min-h-screen pt-20 px-4">
      <div className="max-w-[1320px] mx-auto py-8">
        <h1 className="text-2xl font-bold text-text-primary mb-6">Корзина</h1>
        {items.length === 0 ? (
          <p className="text-text-secondary">Корзина пуста</p>
        ) : (
          <>
            <div className="space-y-4 mb-6">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-4 p-4 bg-surface border border-border rounded-lg">
                  <img src={item.image} alt={item.name} className="w-16 h-16 rounded-md object-cover bg-surface-3" />
                  <div className="flex-1">
                    <p className="font-medium text-text-primary">{item.name}</p>
                    <p className="text-sm text-text-secondary">Кол: {item.quantity}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-7 h-7 flex items-center justify-center rounded border border-border bg-surface-2 hover:bg-surface-3 text-text-primary"
                        aria-label="Уменьшить количество"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm text-text-primary">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-7 h-7 flex items-center justify-center rounded border border-border bg-surface-2 hover:bg-surface-3 text-text-primary"
                        aria-label="Увеличить количество"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="ml-2 text-xs text-text-muted hover:text-primary transition-colors"
                        aria-label="Удалить"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                  <p className="font-semibold text-text-primary shrink-0">{formatPrice(item.price * item.quantity)}</p>
                </div>
              ))}
            </div>
            <div className="text-right border-t border-border pt-4">
              <p className="text-lg font-bold text-text-primary">Итого: {formatPrice(totalPrice)}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
