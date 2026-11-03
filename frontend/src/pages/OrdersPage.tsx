import { useState } from 'react'
import { Header } from '../components/Header'
import { useAccountStore } from '../stores/accountStore'
import { useCartStore, type Order, type OrderItem, type BuildComponent } from '../stores/cartStore'
import { formatPrice } from '../utils/formatPrice'
import placeholder from '../assets/placeholder.jpg'
import { FiChevronDown, FiChevronRight, FiBox } from 'react-icons/fi'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function itemLabel(count: number): string {
  const lastTwo = count % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'товаров'
  const last = count % 10
  if (last === 1) return 'товар'
  return last >= 2 && last <= 4 ? 'товара' : 'товаров'
}

interface OrderItemCardProps {
  item: OrderItem
  level?: number
}

function getEffectiveImage(item: OrderItem): string {
  return item.image || placeholder
}

function OrderItemCard({ item, level = 0 }: OrderItemCardProps) {
  const [buildExpanded, setBuildExpanded] = useState(false)
  const hasComponents = 'components' in item && item.components && item.components.length > 0
  const isBuild = hasComponents

  return (
    <div className={level === 0 ? '' : 'ml-4'}>
      {/* Product row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-4 border-b border-border">
        {/* Image */}
        <div className="shrink-0 w-20 h-20 rounded-lg bg-surface-3 overflow-hidden">
          <img src={getEffectiveImage(item)} alt={item.name} className="w-full h-full object-contain" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary sm:text-base truncate">{item.name}</h3>
          {isBuild && (
            <span className="inline-flex items-center gap-1 mt-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <FiBox className="w-3 h-3" />
              Пользовательская сборка
            </span>
          )}
        </div>

        {/* Quantity + Price */}
        <div className="flex items-center gap-4 sm:gap-6 shrink-0">
          <span className="text-sm text-text-muted">× {item.quantity}</span>
          <span className="text-base font-bold text-text-primary whitespace-nowrap">
            {formatPrice(item.total)}
          </span>
          {isBuild && (
            <button
              onClick={() => setBuildExpanded((e) => !e)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-3 text-text-muted hover:text-text-primary hover:bg-surface transition-colors shrink-0"
              aria-label={buildExpanded ? 'Скрыть состав' : 'Показать состав'}
            >
              {buildExpanded ? <FiChevronDown className="w-4 h-4" /> : <FiChevronRight className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Build components */}
      {isBuild && buildExpanded && 'components' in item && item.components && (
        <div className="mt-3 rounded-xl border border-border bg-surface/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-text-primary">Состав сборки</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            {item.components.map((comp: BuildComponent, idx: number) => (
              <div key={idx} className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0">
                <div className="shrink-0 w-10 h-10 rounded bg-surface-3 overflow-hidden">
                  <img src={comp.image || placeholder} alt="" className="w-full h-full object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-text-muted truncate">{comp.category}</p>
                  <p className="text-sm text-text-primary truncate">{comp.name}</p>
                  {comp.specs && <p className="text-xs text-text-muted truncate">{comp.specs}</p>}
                </div>
                <span className="shrink-0 text-xs text-text-muted">× {comp.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// For legacy orders without image field, try to find a matching image by name
function getItemImage(item: OrderItem): string {
  return item.image || placeholder
}

export function OrdersPage() {
  const account = useAccountStore((s) => s.activeAccount)
  const orders = useCartStore((s) => s.orders)
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null)

  // Filter orders for current account, sort newest first
  const accountOrders = account
    ? orders
        .filter((o) => o.ownerId === account.id)
        .sort((a, b) => b.timestamp - a.timestamp)
    : []

  const orderCount = accountOrders.length

  if (!account) {
    return (
      <div className="min-h-screen bg-surface-2">
        <Header />
        <main className="pt-24 px-4 flex flex-col items-center justify-center text-center">
          <div className="max-w-md w-full rounded-2xl border border-border bg-surface p-8 sm:p-12 shadow-[0_5px_24px_var(--color-shadow)]">
            <h2 className="text-xl font-bold text-text-primary mb-2">Мои заказы</h2>
            <p className="text-text-muted mb-6">Войдите в аккаунт, чтобы увидеть историю заказов.</p>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
            >
              На главную
            </a>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-2">
      <Header />
      <main className="pt-24 px-4">
        <div className="max-w-[900px] mx-auto py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <h1 className="text-3xl font-bold text-text-primary">Мои заказы</h1>
            <span className="inline-flex items-center rounded-lg bg-surface-3 border border-border px-4 py-1.5 text-sm text-text-muted">
              Всего заказов: {orderCount}
            </span>
          </div>

          {/* Orders list */}
          {accountOrders.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-12 text-center shadow-[0_5px_24px_var(--color-shadow)]">
              <svg className="w-16 h-16 text-text-muted mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.8 7M17 13l1.8 7M13 5v8M13 13V5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h2 className="text-xl font-semibold text-text-primary mb-2">Заказов пока нет</h2>
              <p className="text-sm text-text-muted mb-6">Оформите первый заказ в каталоге или корзине.</p>
              <a
                href="/catalog"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
              >
                Перейти в каталог
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              {accountOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isExpanded={expandedOrderId === order.id}
                  onToggle={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

interface OrderCardProps {
  order: Order
  isExpanded: boolean
  onToggle: () => void
}

function OrderCard({ order, isExpanded, onToggle }: OrderCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-[0_5px_24px_var(--color-shadow)] overflow-hidden">
      {/* Order header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-border">
        <div className="flex items-center gap-4">
          {/* Order icon */}
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FiBox className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Заказ #{String(order.id).padStart(6, '0')}</h2>
            <p className="text-sm text-text-muted">
              от {formatDate(order.timestamp)} · {order.itemCount} {itemLabel(order.itemCount)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-xl font-bold text-text-primary whitespace-nowrap">
            {formatPrice(order.total)}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-sm font-medium text-emerald-500">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 4L12 14.01l-3-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Завершён (демо)
          </span>
          <button
            onClick={onToggle}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-3 text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
            aria-label={isExpanded ? 'Скрыть' : 'Развернуть'}
          >
            {isExpanded ? <FiChevronDown className="w-4 h-4" /> : <FiChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Order items */}
      {isExpanded && (
        <div className="p-4 sm:p-6">
          <div className="divide-y divide-border">
            {order.items.map((item) => (
              <OrderItemCard key={`${item.id}-${item.timestamp}`} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


