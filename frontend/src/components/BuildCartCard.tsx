import { useCartStore } from '../stores/cartStore'
import { formatPrice } from '../utils/formatPrice'
import placeholder from '../assets/placeholder.jpg'
import { HiMiniChevronDown, HiMiniChevronRight } from 'react-icons/hi2'

interface BuildCartCardProps {
  item: {
    id: number
    name: string
    price: number
    quantity: number
    image: string
    description: string
    isExpanded: boolean
    components: {
      category: string
      name: string
      specs: string
      quantity: number
      image?: string
    }[]
  }
}

export function BuildCartCard({ item }: BuildCartCardProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const toggleExpand = useCartStore((s) => s.toggleBuildExpand)

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Accent left border */}
      <div className="border-l-2 border-primary" />
      <div className="flex items-start gap-4 p-4">
        <img
          src={item.image || placeholder}
          alt={item.name}
          className="w-24 h-24 rounded-lg object-cover bg-surface-3 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-text-primary text-sm leading-tight">
                {item.name}
              </p>
              <span className="inline-flex items-center gap-1 text-xs text-primary border border-primary/30 px-2 py-0.5 rounded-full mt-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                Пользовательская сборка
              </span>
            </div>
            <button
              onClick={() => removeItem(item.id)}
              className="text-text-muted hover:text-text-primary transition-colors shrink-0"
              aria-label="Удалить"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1.5">{item.description}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
              В наличии
            </span>
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center">
              <button
                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-l-lg border border-border bg-surface hover:bg-surface-3 text-text-primary text-sm font-medium transition-colors"
                aria-label="Уменьшить количество"
              >
                −
              </button>
              <span className="w-10 h-8 flex items-center justify-center border-t border-b border-border bg-surface text-sm font-medium text-text-primary">
                {item.quantity}
              </span>
              <button
                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-r-lg border border-border bg-surface hover:bg-surface-3 text-text-primary text-sm font-medium transition-colors"
                aria-label="Увеличить количество"
              >
                +
              </button>
            </div>
            <span className="font-bold text-text-primary text-base">
              {formatPrice(item.price * item.quantity)}
            </span>
          </div>
        </div>
      </div>

      {/* Expandable component list */}
      <button
        onClick={() => toggleExpand(item.id)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-surface border-t border-border hover:bg-surface-2 transition-colors text-sm"
      >
        <span className="font-medium text-text-primary">Состав сборки</span>
        {item.isExpanded ? (
          <HiMiniChevronDown className="w-4 h-4 text-text-muted" />
        ) : (
          <HiMiniChevronRight className="w-4 h-4 text-text-muted" />
        )}
      </button>

      {item.isExpanded && (
        <div className="border-t border-border">
          {item.components.map((comp, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 px-4 py-2.5 border-t border-border hover:bg-surface-2 transition-colors"
            >
              <div className="w-10 h-7 flex items-center justify-center shrink-0">
                {comp.image ? (
                  <img
                    src={comp.image}
                    alt=""
                    className="w-8 h-6 rounded object-cover"
                  />
                ) : (
                  <div className="w-8 h-6 bg-surface-3 rounded" />
                )}
              </div>
              <span className="text-xs text-text-muted shrink-0 w-24">{comp.category}</span>
              <span className="text-sm text-text-primary shrink-0 flex-1 min-w-0 truncate">
                {comp.name}
              </span>
              <span className="text-xs text-text-muted shrink-0 hidden sm:block max-w-[120px] truncate">
                {comp.specs}
              </span>
              <span className="text-sm text-text-muted shrink-0">{comp.quantity} шт.</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
