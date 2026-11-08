import { BackButton } from '../components/BackButton'
import { formatPrice } from '../utils/formatPrice'
import { useTranslation } from 'react-i18next'
import { Header } from '../components/Header'
import { ProductCartItem } from '../components/ProductCartItem'
import { BuildCartCard } from '../components/BuildCartCard'
import { OrderSummary } from '../components/OrderSummary'
import { useServerCart } from '../api/useServerCart'
import { cartItems, orderFromServer } from '../api/cartAdapter'
import { useUIStore } from '../stores/uiStore'
import { useAccountStore } from '../stores/accountStore'
import type { RegularCartItem, BuildCartItem, Order } from '../stores/cartStore'
import { useState } from 'react'
import { Link } from 'react-router'

interface DemoOrderMessage {
  type: 'success'
  order: Order
}

export function CartPage() {
  const accountId = useAccountStore(state => state.activeAccountId)
  return <CartContent key={accountId ?? 'guest'} />
}

function CartContent() {
  const { t } = useTranslation()
  const { accountId, cart, update, remove, checkout } = useServerCart()
  const openAuth = useUIStore(state => state.openAuthModal)
  const items = cart.data ? cartItems(cart.data) : []
  const [orderMessage, setOrderMessage] = useState<DemoOrderMessage | null>(null)

  const regularItems = items.filter((i): i is RegularCartItem => !('components' in i))
  const buildItems = items.filter((i): i is BuildCartItem => 'components' in i)
  const pending = update.isPending || remove.isPending || checkout.isPending || cart.isFetching

  const handleCheckout = async () => {
    if (items.length === 0) return
    try { const result = await checkout.mutateAsync(); setOrderMessage({ type: 'success', order: orderFromServer(result.order) }) }
    catch { /* The error is displayed below. */ }
  }

  return (
    <div className="min-h-screen bg-surface-2">
      <Header />

      <main className="pt-20 px-4">
        <div className="max-w-[1320px] mx-auto py-8">
          <BackButton className="mb-4" />
          {cart.isError || update.isError || remove.isError || checkout.isError ? <p role="alert" className="text-sm text-red-500">{t('common.load_error')}</p> : null}
          {!accountId ? <div className="py-16 text-center"><p className="mb-4 text-text-muted">{t('orders.login_desc')}</p><button type="button" onClick={() => openAuth('login')} className="rounded-lg bg-primary px-6 py-2.5 font-medium text-white hover:bg-primary-hover">{t('orders.login_btn')}</button></div> : cart.isLoading ? <p role="status">{t('common.loading')}</p> : cart.isError ? null : orderMessage ? (
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-8 text-center">
              <svg className="w-16 h-16 text-green-500 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M22 4L12 14.01l-3-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h2 className="text-2xl font-bold text-green-700 dark:text-green-400 mb-2">{t('cart.order_success')}</h2>
              <p className="text-text-muted mb-4">
                {t('cart.order_success_desc', { id: String(orderMessage.order.id).padStart(6, '0'), count: orderMessage.order.itemCount, price: formatPrice(orderMessage.order.total) })}
              </p>
              <p className="text-sm text-text-muted">
                {t('orders.title')}
              </p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg className="w-20 h-20 text-text-muted mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.8 7M17 13l1.8 7M13 5v8M13 13V5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h2 className="text-xl font-semibold text-text-primary mb-2">{t('cart.empty_title')}</h2>
              <p className="text-sm text-text-muted mb-4 max-w-sm">
                {t('cart.empty_desc')}
              </p>
              <div className="flex items-center gap-3">
                <Link
                  to="/catalog"
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
                >
                  {t('cart.go_catalog')}
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
              {/* Left: Product list */}
              <div className="min-w-0 rounded-2xl border border-border bg-surface p-3 shadow-[0_5px_24px_var(--color-shadow)] sm:p-4">
                <div className="divide-y divide-border">
                  {regularItems.map((item) => (
                    <ProductCartItem key={item.id} item={item} pending={pending} onQuantityChange={(id, quantity) => update.mutate({ id, quantity })} onRemove={id => remove.mutate(id)} />
                  ))}
                </div>
                {buildItems.length > 0 && (
                  <div className="space-y-3 pt-2">
                    {buildItems.map((item) => (
                      <BuildCartCard key={item.id} item={item} pending={pending} onQuantityChange={(id, quantity) => update.mutate({ id, quantity })} onRemove={id => remove.mutate(id)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Order summary */}
              <div className="min-w-0">
                <OrderSummary onCheckout={handleCheckout} pending={pending} totalItems={cart.data?.item_count ?? 0} totalPrice={Number(cart.data?.subtotal ?? 0)} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
