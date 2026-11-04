import { useBuilderStore, BUILDER_CATEGORIES } from '../stores/builderStore'
import { formatPrice } from '../utils/formatPrice'
import { FiCheckCircle, FiAlertCircle, FiMinus, FiZap } from 'react-icons/fi'

interface BuilderSidebarProps {
  onAddToCart: () => void
}

export function BuilderSidebar({ onAddToCart }: BuilderSidebarProps) {
  const selectedCount = useBuilderStore((s) => s.selectedCount())
  const totalPrice = useBuilderStore((s) => s.totalPrice())
  const compatChecks = useBuilderStore((s) => s.checkCompatibility())
  const estimatedPower = useBuilderStore((s) => s.estimatedPower)
  const hasIncompatibilities = useBuilderStore((s) => s.hasIncompatibilities())
  const isComplete = useBuilderStore((s) => s.isComplete())

  const compatibleCount = compatChecks.filter((c) => c.status === 'compatible').length
  const incompatibleCount = compatChecks.filter((c) => c.status === 'incompatible').length
  const unknownCount = compatChecks.filter((c) => c.status === 'unknown').length

  const allCompatible = incompatibleCount === 0 && selectedCount === BUILDER_CATEGORIES.length
  const canAddToCart = isComplete

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-5 sticky top-24">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Ваша сборка</h2>
        <p className="text-sm text-text-secondary mt-1">
          {selectedCount} из {BUILDER_CATEGORIES.length} компонентов
        </p>
      </div>

      {/* Compatibility */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Совместимость</span>
          {allCompatible ? (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-500">
              <FiCheckCircle className="h-4 w-4" />
              Всё совместимо
            </span>
          ) : incompatibleCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-sm text-red-500">
              <FiAlertCircle className="h-4 w-4" />
              {incompatibleCount} конфликтов
            </span>
          ) : (
            <span className="text-sm text-text-muted">Проверка...</span>
          )}
        </div>

        {/* Compatibility details */}
        {compatChecks.length > 0 && (
          <div className="space-y-1.5">
            {compatChecks.map((check, index) => (
              <div key={index} className="flex items-start gap-2 text-xs">
                {check.status === 'compatible' ? (
                  <FiCheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                ) : check.status === 'incompatible' ? (
                  <FiAlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                ) : (
                  <FiMinus className="h-3.5 w-3.5 text-text-muted shrink-0 mt-0.5" />
                )}
                <div>
                  <span className={`font-medium ${
                    check.status === 'compatible' ? 'text-text-primary' :
                    check.status === 'incompatible' ? 'text-red-500' : 'text-text-muted'
                  }`}>
                    {check.label}
                  </span>
                  {check.detail && (
                    <span className="block text-text-muted">{check.detail}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Power consumption */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm text-text-secondary">
          <FiZap className="h-4 w-4" />
          Оценка энергопотребления
        </span>
        <span className="text-sm text-text-secondary">
          {estimatedPower !== null ? `~ ${estimatedPower} Вт` : '—'}
        </span>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Price */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">Стоимость комплектующих</span>
        <span className="text-sm text-text-primary">{formatPrice(totalPrice)}</span>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-text-primary">Итого</span>
        <span className="text-2xl font-bold text-primary">{formatPrice(totalPrice)}</span>
      </div>

      {/* Add to cart button */}
      <button
        onClick={onAddToCart}
        disabled={!canAddToCart}
        className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
          canAddToCart
            ? 'bg-primary text-white hover:bg-primary-hover'
            : 'bg-surface-3 text-text-muted cursor-not-allowed'
        }`}
      >
        <FiCheckCircle className="h-5 w-5" />
        Добавить сборку в корзину
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
        </svg>
      </button>

      {incompatibleCount > 0 && canAddToCart && (
        <p className="text-xs text-amber-600 text-center">
          Есть несовместимости, но сборка завершена
        </p>
      )}
      {unknownCount > 0 && incompatibleCount === 0 && canAddToCart && (
        <p className="text-xs text-text-muted text-center">
          Проверка совместимости включена. Некоторые параметры проверены частично.
        </p>
      )}
    </div>
  )
}
