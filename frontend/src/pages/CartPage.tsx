import { Header } from '../components/Header'
import { ProductCartItem } from '../components/ProductCartItem'
import { BuildCartCard } from '../components/BuildCartCard'
import { OrderSummary } from '../components/OrderSummary'
import { useCartStore, seedDemoCart } from '../stores/cartStore'
import type { RegularCartItem, BuildCartItem } from '../stores/cartStore'
import { useState } from 'react'
import { Link } from 'react-router'

interface DemoOrderMessage {
  type: 'success'
  orderId: number
  itemCount: number
}

export function CartPage() {
  const items = useCartStore((s) => s.items)
  const placeOrder = useCartStore((s) => s.placeOrder)
  const [orderMessage, setOrderMessage] = useState<DemoOrderMessage | null>(null)

  const regularItems = items.filter((i): i is RegularCartItem => 'category' in i && Array.isArray((i as RegularCartItem).specs))
  const buildItems = items.filter((i): i is BuildCartItem => 'components' in i)

  const handleCheckout = () => {
    const orders = placeOrder()
    if (orders[0]?.length) {
      setOrderMessage({
        type: 'success',
        orderId: orders[0][0].id,
        itemCount: orders[0].reduce((sum, o) => sum + o.quantity, 0),
      })
    }
  }

  return (
    <div className="min-h-screen bg-surface-2">
      <Header />

      <main className="pt-20 px-4">
        <div className="max-w-[1320px] mx-auto py-8">
          <h1 className="text-2xl font-bold text-text-primary mb-6">Корзина</h1>

          {orderMessage ? (
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-8 text-center">
              <svg className="w-16 h-16 text-green-500 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M22 4L12 14.01l-3-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h2 className="text-2xl font-bold text-green-700 dark:text-green-400 mb-2">Спасибо!</h2>
              <p className="text-text-muted mb-4">
                Ваш демо-заказ #000{orderMessage.orderId} на {orderMessage.itemCount} товар(ов) оформлен.
              </p>
              <p className="text-sm text-text-muted">
                Запись сохранена в истории заказов (раздел в разработке).
              </p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg className="w-20 h-20 text-text-muted mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.8 7M17 13l1.8 7M13 5v8M13 13V5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h2 className="text-xl font-semibold text-text-primary mb-2">Корзина пуста</h2>
              <p className="text-sm text-text-muted mb-4 max-w-sm">
                Добавьте товары из каталога или загрузите демо-набор для проверки.
              </p>
              <div className="flex items-center gap-3">
                <Link
                  to="/catalog"
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
                >
                  Перейти в каталог
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
                <button
                  onClick={() => seedDemoCart()}
                  className="inline-flex items-center gap-2 border border-border text-text-primary font-medium px-6 py-2.5 rounded-lg hover:bg-surface-3 transition-colors"
                >
                  Загрузить демо
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left: Product list */}
              <div className="flex-1 space-y-4">
                {regularItems.map((item) => (
                  <ProductCartItem key={item.id} item={item} />
                ))}
                {buildItems.map((item) => (
                  <BuildCartCard key={item.id} item={item} />
                ))}
              </div>

              {/* Right: Order summary */}
              <div className="w-full lg:w-[340px] shrink-0">
                <OrderSummary onCheckout={handleCheckout} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
