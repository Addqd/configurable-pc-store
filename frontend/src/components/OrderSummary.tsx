import { useTranslation } from 'react-i18next'
import { formatPrice } from '../utils/formatPrice'
import { FiArrowRight, FiTruck } from 'react-icons/fi'

interface OrderSummaryProps {
  onCheckout?: () => void
  showCheckoutButton?: boolean
  totalItems: number
  totalPrice: number
  pending?: boolean
}

const FREE_SHIPPING_THRESHOLD = 50000

export function OrderSummary({ onCheckout, showCheckoutButton = true, totalItems, totalPrice, pending }: OrderSummaryProps) {
  const { t } = useTranslation()
  const isFreeShipping = totalPrice >= FREE_SHIPPING_THRESHOLD

  return (
    <aside className="sticky top-20 rounded-2xl border border-border bg-surface p-5 shadow-[0_5px_24px_var(--color-shadow)] sm:p-6">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
        <h2 className="text-xl font-bold text-text-primary sm:text-2xl">{t('cart.summary')}</h2>
        <span className="whitespace-nowrap text-sm text-text-muted">{t('common.items', { count: totalItems })}</span>
      </div>

      <div className="space-y-3 border-b border-border py-5 text-sm sm:text-base">
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-secondary">{t('cart.subtotal', { count: totalItems })}</span>
          <span className="whitespace-nowrap text-text-primary">{formatPrice(totalPrice)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-secondary">{t('cart.discount')}</span>
          <span className="text-text-primary">{t('cart.discount_none', { price: formatPrice(0) })}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-secondary">{t('cart.shipping')}</span>
          <span className={isFreeShipping ? 'text-text-primary' : 'text-text-muted'}>
            {isFreeShipping ? t('cart.free') : t('cart.calculated')}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 py-5">
        <strong className="text-lg text-text-primary sm:text-xl">{t('cart.total')}</strong>
        <strong className="whitespace-nowrap text-xl text-text-primary sm:text-2xl">{formatPrice(totalPrice)}</strong>
      </div>

      {showCheckoutButton && (
        <button
          type="button"
          onClick={onCheckout}
          disabled={!onCheckout || totalItems === 0 || pending}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-default disabled:opacity-50 dark:text-[#08090C]"
        >
          {t('cart.checkout')}
          <FiArrowRight className="h-5 w-5" />
        </button>
      )}

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-4">
        <FiTruck className="h-7 w-7 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold text-text-primary">{t('cart.free_shipping')}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {isFreeShipping
              ? t('cart.free_shipping_desc')
              : t('cart.free_shipping_remaining', { price: formatPrice(FREE_SHIPPING_THRESHOLD - totalPrice) })}
          </p>
        </div>
      </div>
    </aside>
  )
}
