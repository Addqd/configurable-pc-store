import { useCartStore } from '../stores/cartStore'
import { formatPrice } from '../utils/formatPrice'

interface OrderSummaryProps {
  onCheckout?: () => void
  showCheckoutButton?: boolean
}

const FREE_SHIPPING_THRESHOLD = 50000

export function OrderSummary({ onCheckout, showCheckoutButton = true }: OrderSummaryProps) {
  const totalItems = useCartStore((s) => s.totalItems())
  const totalPrice = useCartStore((s) => s.totalPrice())
  const isFreeShipping = totalPrice >= FREE_SHIPPING_THRESHOLD

  return (
    <div className="bg-surface border border-border rounded-xl p-5 sticky top-20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-text-primary">Ваш заказ</h2>
        <span className="text-sm text-text-muted">{totalItems} товара</span>
      </div>

      <div className="space-y-3 mb-4 pb-4 border-b border-border">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Товары ({totalItems})</span>
          <span className="text-text-primary">{formatPrice(totalPrice)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Скидка</span>
          <span className="text-text-primary">− 0 ₽</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Доставка</span>
          {isFreeShipping ? (
            <span className="text-text-primary">Бесплатно</span>
          ) : (
            <span className="text-text-muted">Рассчитывается отдельно</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-lg font-bold text-text-primary">Итого</span>
        <span className="text-2xl font-bold text-text-primary">{formatPrice(totalPrice)}</span>
      </div>

      {showCheckoutButton && (
        <button
          onClick={onCheckout}
          className="w-full py-3.5 bg-primary hover:bg-primary-hover text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 text-base"
        >
          Оформить заказ
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      )}

      <div className="mt-4 p-3 bg-surface-2 border border-border rounded-lg flex items-start gap-3">
        <svg className="w-6 h-6 text-primary shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M13 16V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h1m16-3v-5a2 2 0 0 0-1-1.73l-5-3A2 2 0 0 0 16 6H8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <p className="text-sm font-medium text-text-primary">Бесплатная доставка</p>
          <p className="text-xs text-text-muted mt-0.5">
            {isFreeShipping
              ? 'При заказе от 50 000 ₽'
              : `Осталось ${formatPrice(FREE_SHIPPING_THRESHOLD - totalPrice)} до бесплатной доставки`
            }
          </p>
        </div>
      </div>
    </div>
  )
}
