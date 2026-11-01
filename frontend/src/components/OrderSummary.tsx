import { useCartStore } from '../stores/cartStore'
import { formatPrice } from '../utils/formatPrice'
import { FiArrowRight, FiTruck } from 'react-icons/fi'

interface OrderSummaryProps {
  onCheckout?: () => void
  showCheckoutButton?: boolean
}

const FREE_SHIPPING_THRESHOLD = 50000

function itemLabel(count: number) {
  const lastTwo = count % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'товаров'
  const last = count % 10
  if (last === 1) return 'товар'
  return last >= 2 && last <= 4 ? 'товара' : 'товаров'
}

export function OrderSummary({ onCheckout, showCheckoutButton = true }: OrderSummaryProps) {
  const totalItems = useCartStore((s) => s.totalItems())
  const totalPrice = useCartStore((s) => s.totalPrice())
  const isFreeShipping = totalPrice >= FREE_SHIPPING_THRESHOLD

  return (
    <aside className="sticky top-20 rounded-2xl border border-border bg-surface p-5 shadow-[0_5px_24px_var(--color-shadow)] sm:p-6">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
        <h2 className="text-xl font-bold text-text-primary sm:text-2xl">Ваш заказ</h2>
        <span className="whitespace-nowrap text-sm text-text-muted">{totalItems} {itemLabel(totalItems)}</span>
      </div>

      <div className="space-y-3 border-b border-border py-5 text-sm sm:text-base">
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-secondary">Товары ({totalItems})</span>
          <span className="whitespace-nowrap text-text-primary">{formatPrice(totalPrice)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-secondary">Скидка</span>
          <span className="text-text-primary">− 0 ₽</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-secondary">Доставка</span>
          <span className={isFreeShipping ? 'text-text-primary' : 'text-text-muted'}>
            {isFreeShipping ? 'Бесплатно' : 'Рассчитывается отдельно'}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 py-5">
        <strong className="text-lg text-text-primary sm:text-xl">Итого</strong>
        <strong className="whitespace-nowrap text-xl text-text-primary sm:text-2xl">{formatPrice(totalPrice)}</strong>
      </div>

      {showCheckoutButton && (
        <button
          type="button"
          onClick={onCheckout}
          disabled={!onCheckout || totalItems === 0}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#08090C]"
        >
          Купить
          <FiArrowRight className="h-5 w-5" />
        </button>
      )}

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-4">
        <FiTruck className="h-7 w-7 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold text-text-primary">Бесплатная доставка</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {isFreeShipping
              ? 'При заказе от 50 000 ₽'
              : `Осталось ${formatPrice(FREE_SHIPPING_THRESHOLD - totalPrice)} до бесплатной доставки`}
          </p>
        </div>
      </div>
    </aside>
  )
}
