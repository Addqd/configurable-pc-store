import { useTranslation } from 'react-i18next'
import { catalogDisplay } from '../i18n/catalogDisplay'
import { useMemo } from 'react'
import {
  useBuilderStore, BUILDER_CATEGORIES, countSelected, calculateBuilderPrice,
  checkBuildCompatibility, estimateComponentPower, isBuildCartEligible,
} from '../stores/builderStore'
import { formatPrice } from '../utils/formatPrice'
import { FiCheckCircle, FiAlertTriangle, FiShield, FiShoppingCart } from 'react-icons/fi'

interface BuilderSidebarProps { onAddToCart: () => void }

export function BuilderSidebar({ onAddToCart }: BuilderSidebarProps) {
  const { t } = useTranslation()
  const selections = useBuilderStore((state) => state.selections)
  // Never return a newly created array from a Zustand selector (React 19 infinite-loop risk).
  const checks = useMemo(() => checkBuildCompatibility(selections), [selections])
  const count = countSelected(selections)
  const price = calculateBuilderPrice(selections)
  const power = estimateComponentPower(selections)
  const eligible = isBuildCartEligible(selections)
  const conflicts = checks.filter((check) => check.status === 'incompatible')
  const unknown = checks.filter((check) => check.status === 'unknown')
  const completelyChecked = eligible && unknown.length === 0 && checks.length >= 6

  return (
    <aside className="rounded-2xl border border-border bg-surface p-5 shadow-[0_5px_24px_var(--color-shadow)] lg:sticky lg:top-24">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-4">
        <h2 className="text-xl font-bold text-text-primary">Ваша сборка</h2>
        <span className="text-xs text-text-muted">{count} из {BUILDER_CATEGORIES.length} компонентов</span>
      </div>

      <div className="space-y-3 border-b border-border py-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-text-muted">Совместимость</span>
          {conflicts.length ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-red-500"><FiAlertTriangle /> {conflicts.length} конфликт(ов)</span>
          ) : completelyChecked ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-500"><FiCheckCircle /> Всё совместимо</span>
          ) : (
            <span className="font-medium text-amber-600 dark:text-amber-400">{count === 0 ? 'Не проверена' : 'Проверено частично'}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-text-muted">Оценка энергопотребления</span>
          <span className="font-medium text-text-primary">{power !== null ? `≥ ${power} Вт*` : 'Нет данных'}</span>
        </div>
        {power !== null && <p className="text-xs text-text-muted">* Только CPU + GPU; остальные компоненты и запас не учтены.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-text-muted">Стоимость комплектующих</span>
          <span className="font-medium text-text-primary">{formatPrice(price)}</span>
        </div>
        {conflicts.length > 0 && (
          <div className="space-y-1 text-xs text-red-500" role="alert">
            {conflicts.map((check) => <p key={check.label}>{catalogDisplay(check.label)}: {catalogDisplay(check.detail)}</p>)}
          </div>
        )}
        {unknown.length > 0 && count > 0 && (
          <details className="text-xs text-text-muted">
            <summary className="cursor-pointer hover:text-primary">{t('builder.unknown_checks', { count: unknown.length })}</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {unknown.map((check) => <li key={check.label}>{catalogDisplay(check.label)}: {catalogDisplay(check.detail)}</li>)}
            </ul>
          </details>
        )}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3 py-5">
        <strong className="text-lg text-text-primary">Итого</strong>
        <strong className="text-2xl text-text-primary">{formatPrice(price)}</strong>
      </div>
      <button type="button" onClick={onAddToCart} disabled={!eligible}
        aria-describedby={!eligible ? 'builder-cart-validation' : undefined}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-default disabled:opacity-50 disabled:hover:bg-primary dark:text-[#08090C]">
        <FiShoppingCart className="h-5 w-5" /> Добавить сборку в корзину <span aria-hidden="true">→</span>
      </button>
      {!eligible && (
        <p id="builder-cart-validation" role="alert" className="mt-2 text-xs text-red-500">
          {count < BUILDER_CATEGORIES.length && (
            <span className="block">Выберите все компоненты: осталось {BUILDER_CATEGORIES.length - count} из {BUILDER_CATEGORIES.length}.</span>
          )}
          {conflicts.length > 0 && (
            <span className="block">{t('builder.compatibility_error', { conflicts: conflicts.map((check) => catalogDisplay(check.label)).join(', ') })}</span>
          )}
        </p>
      )}
      {eligible && unknown.length > 0 && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400" role="status">
          Некоторые проверки недоступны. Добавление не означает полной совместимости.
        </p>
      )}

      <div className="mt-4 flex items-start gap-3 rounded-xl bg-surface-2 p-4">
        <FiShield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold text-text-primary">Проверка совместимости включена</p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">Проверяем только параметры, подтверждённые характеристиками каталога.</p>
        </div>
      </div>
    </aside>
  )
}
