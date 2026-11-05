import { catalogDisplay } from '../i18n/catalogDisplay'
import { useTranslation } from 'react-i18next'
import { useCartStore, type BuildCartItem } from '../stores/cartStore'
import { formatPrice } from '../utils/formatPrice'
import placeholder from '../assets/placeholder.jpg'
import { FiX, FiChevronDown, FiChevronRight, FiCpu } from 'react-icons/fi'

interface BuildCartCardProps {
  item: BuildCartItem
}

export function BuildCartCard({ item }: BuildCartCardProps) {
  const { t } = useTranslation()
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const toggleExpand = useCartStore((s) => s.toggleBuildExpand)

  return (
    <article className="rounded-xl border border-primary/60 bg-primary/5 p-3 sm:p-4">
      <div className="mb-3 flex justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1 text-xs font-medium text-primary">
          <FiCpu className="h-4 w-4" />
          {t('cart.custom_build')}
        </span>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <img
            src={item.image || placeholder}
            alt={item.name}
            className="h-28 w-28 shrink-0 rounded-lg bg-surface-3 object-contain sm:h-32 sm:w-36"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-text-primary sm:text-base">{item.name}</h2>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">{item.description}</p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-emerald-500">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              {t('cart.in_stock')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 sm:gap-5 md:justify-end">
          <div className="inline-flex h-10 items-center overflow-hidden rounded-lg border border-border bg-surface-2">
            <button
              type="button"
              onClick={() => updateQuantity(item.id, item.quantity - 1)}
              disabled={item.quantity <= 1}
              className="flex h-full w-9 items-center justify-center text-lg text-text-primary hover:bg-surface-3 disabled:cursor-default disabled:opacity-40"
              aria-label={t('cart.decrease_named', { name: item.name })}
            >
              −
            </button>
            <span className="flex h-full min-w-10 items-center justify-center bg-surface px-2 text-sm font-semibold text-text-primary">{item.quantity}</span>
            <button
              type="button"
              onClick={() => updateQuantity(item.id, item.quantity + 1)}
              className="flex h-full w-9 items-center justify-center text-lg text-text-primary hover:bg-surface-3"
              aria-label={t('cart.increase_named', { name: item.name })}
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
            aria-label={t('cart.remove_named', { name: item.name })}
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        <button
          type="button"
          onClick={() => toggleExpand(item.id)}
          aria-expanded={item.isExpanded}
          className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold text-text-primary transition-colors hover:bg-surface-2"
        >
          {t('orders.build_composition')}
          {item.isExpanded ? <FiChevronDown className="h-4 w-4" /> : <FiChevronRight className="h-4 w-4" />}
        </button>
        {item.isExpanded && (
          <div className="divide-y divide-border border-t border-border px-3">
            {item.components.map((comp, index) => (
              <div key={`${comp.category}-${index}`} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2 py-2 sm:grid-cols-[38px_110px_minmax(0,1fr)_110px_35px]">
                <img src={comp.image || placeholder} alt="" className="h-8 w-8 rounded bg-surface-3 object-contain" />
                <span className="hidden text-xs text-text-muted sm:block">{catalogDisplay(comp.category)}</span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-text-primary sm:text-sm">{comp.name}</p>
                  <p className="truncate text-xs text-text-muted sm:hidden">{catalogDisplay(comp.category)} · {catalogDisplay(comp.specs)}</p>
                </div>
                <span className="hidden truncate text-xs text-text-muted sm:block">{comp.specs}</span>
                <span className="whitespace-nowrap text-xs text-text-muted">× {comp.quantity}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
