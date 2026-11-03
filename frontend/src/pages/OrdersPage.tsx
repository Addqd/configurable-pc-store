import { useState } from 'react'
import { Link } from 'react-router'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { BackButton } from '../components/BackButton'
import { useAccountStore, selectActiveAccount } from '../stores/accountStore'
import { useCartStore, type Order, type OrderItem, type BuildComponent } from '../stores/cartStore'
import { useUIStore } from '../stores/uiStore'
import { formatPrice } from '../utils/formatPrice'
import placeholder from '../assets/placeholder.jpg'
import { FiChevronDown, FiChevronUp, FiBox, FiCheckCircle, FiShoppingCart } from 'react-icons/fi'

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('ru-RU').format(new Date(timestamp))
}

function countLabel(count: number) {
  const tens = count % 100
  const units = count % 10
  return tens >= 11 && tens <= 14 ? 'товаров' : units === 1 ? 'товар' : units >= 2 && units <= 4 ? 'товара' : 'товаров'
}

function SnapshotImage({ src, alt, className }: { src?: string; alt: string; className: string }) {
  return <img src={src || placeholder} alt={alt} loading="lazy"
    onError={(event) => { event.currentTarget.src = placeholder }}
    className={className} />
}

function PurchasedBuild({ components }: { components: BuildComponent[] }) {
  return (
    <div className="mt-2 mb-3 rounded-xl border border-primary/20 bg-surface-2 p-3 sm:p-4">
      <div className="mb-3 text-sm font-bold text-text-primary">Состав сборки</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
        {components.map((component, index) => (
          <div key={`${component.category}-${component.name}-${index}`}
            className="grid grid-cols-[36px_minmax(0,1fr)] sm:grid-cols-[40px_minmax(0,1fr)] items-center gap-3 py-2 border-b border-border last:border-b-0 min-w-0">
            <SnapshotImage src={component.image} alt="" className="w-9 h-9 sm:w-10 sm:h-10 object-contain rounded-md bg-surface" />
            <div className="min-w-0">
              <p className="text-xs text-text-muted">{component.category}</p>
              <p className="text-xs sm:text-sm text-text-primary break-words">{component.name}</p>
              {component.quantity > 1 && <p className="text-xs text-text-muted">{component.quantity} шт.</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PurchasedItem({ item }: { item: OrderItem }) {
  const [expanded, setExpanded] = useState(true)
  const isBuild = Array.isArray(item.components) && item.components.length > 0
  return (
    <div className="border-b border-border last:border-0">
      <div className="grid grid-cols-[72px_minmax(0,1fr)] sm:grid-cols-[100px_minmax(0,1fr)_auto] items-center gap-3 sm:gap-5 px-3 sm:px-5 py-3 min-w-0">
        <div className="w-[72px] h-[68px] sm:w-[100px] sm:h-[72px] overflow-hidden rounded-lg bg-surface-2">
          <SnapshotImage src={item.image} alt={item.name} className="w-full h-full object-contain" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary break-words">{item.name}</p>
          {isBuild && <span className="inline-flex rounded-md bg-primary/10 text-primary text-xs px-2 py-1 mt-2">Пользовательская сборка</span>}
        </div>
        <div className="col-start-2 sm:col-start-auto flex items-center gap-3 sm:gap-6 justify-between sm:justify-end">
          <span className="text-sm text-text-muted whitespace-nowrap">{item.quantity} шт.</span>
          <strong className="text-base text-text-primary whitespace-nowrap">{formatPrice(item.total)}</strong>
          {isBuild && (
            <button type="button" onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded} aria-label={expanded ? 'Скрыть состав сборки' : 'Показать состав сборки'}
              className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center border border-border bg-surface-2 text-primary hover:bg-surface-3">
              {expanded ? <FiChevronUp /> : <FiChevronDown />}
            </button>
          )}
        </div>
      </div>
      {isBuild && expanded && <div className="px-3 sm:px-5"><PurchasedBuild components={item.components!} /></div>}
    </div>
  )
}

function OrderCard({ order, isExpanded, onToggle }: { order: Order; isExpanded: boolean; onToggle: () => void }) {
  return (
    <article className="rounded-xl border border-border bg-surface p-3 sm:p-4 shadow-[0_5px_24px_var(--color-shadow)]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 mb-3">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="flex shrink-0 items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
            <FiBox className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-text-primary">Заказ #{String(order.id).padStart(6, '0')}</h2>
            <p className="text-sm text-text-muted">от {formatDate(order.timestamp)} · {order.itemCount} {countLabel(order.itemCount)}</p>
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-3 sm:gap-4 justify-between sm:justify-end">
          <strong className="text-xl text-text-primary whitespace-nowrap">{formatPrice(order.total)}</strong>
          <span className="inline-flex gap-2 items-center rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
            <FiCheckCircle />Завершён (демо)
          </span>
          <button type="button" onClick={onToggle}
            aria-expanded={isExpanded} aria-label={isExpanded ? 'Свернуть заказ' : 'Развернуть заказ'}
            className="shrink-0 w-9 h-9 rounded-lg border border-border bg-surface-2 text-text-primary flex items-center justify-center hover:bg-surface-3">
            {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="rounded-xl border border-border overflow-hidden">
          {order.items.map((item, index) => <PurchasedItem key={`${order.id}-${item.id}-${index}`} item={item} />)}
        </div>
      )}
    </article>
  )
}

function OrdersContent() {
  const account = useAccountStore(selectActiveAccount)
  const orders = useCartStore((state) => state.orders)
  const openAuthModal = useUIStore((state) => state.openAuthModal)
  const [expandedId, setExpandedId] = useState<number | null | undefined>(undefined)

  if (!account) {
    return (
      <main className="min-h-screen bg-surface-2 pt-24 px-4">
        <div className="mx-auto w-full max-w-[1120px]">
          <BackButton className="mb-5" />
          <div className="max-w-md mx-auto w-full h-fit rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-2">Мои заказы</h1>
          <p className="text-text-muted mb-6">Войдите в аккаунт, чтобы увидеть историю заказов.</p>
          <button type="button" onClick={() => openAuthModal('login')}
            className="rounded-lg bg-primary text-white dark:text-[#08090C] px-6 py-2.5 text-sm font-semibold hover:bg-primary-hover">Войти</button>
          </div>
        </div>
      </main>
    )
  }

  const accountOrders = orders.filter((order) => order.ownerId === account.id)
    .sort((a, b) => b.timestamp - a.timestamp || b.id - a.id)
  const openOrder = expandedId === undefined ? accountOrders[0]?.id : expandedId

  return (
    <main className="min-h-screen bg-surface-2 pt-24 px-4 pb-12">
      <div className="max-w-[1120px] mx-auto">
        <BackButton className="mb-5" />
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <h1 className="text-3xl font-bold text-text-primary">Мои заказы</h1>
          <span className="rounded-lg bg-surface-3 px-3 py-1.5 text-sm text-text-muted">Всего заказов: {accountOrders.length}</span>
        </div>
        {accountOrders.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center">
            <FiShoppingCart className="w-14 h-14 text-text-muted mx-auto mb-4" />
            <h2 className="text-xl font-bold text-text-primary mb-2">Заказов пока нет</h2>
            <p className="text-text-muted mb-6">После покупки товары появятся здесь.</p>
            <Link to="/catalog" className="inline-flex rounded-lg bg-primary text-white dark:text-[#08090C] px-5 py-2.5 font-medium hover:bg-primary-hover">Перейти в каталог</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {accountOrders.map((order) => (
              <OrderCard
                key={order.id} order={order} isExpanded={openOrder === order.id}
                onToggle={() => setExpandedId(openOrder === order.id ? null : order.id)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

export function OrdersPage() {
  return <div className="min-h-screen bg-surface-2"><Header /><OrdersContent /><Footer /></div>
}
