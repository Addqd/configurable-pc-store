import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { catalogDisplay } from '../i18n/catalogDisplay'
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
  const checks = useMemo(() => checkBuildCompatibility(selections), [selections])
  const count = countSelected(selections)
  const total = BUILDER_CATEGORIES.length
  const price = calculateBuilderPrice(selections)
  const power = estimateComponentPower(selections)
  const eligible = isBuildCartEligible(selections)
  const conflicts = checks.filter((check) => check.status === 'incompatible')
  const unknown = checks.filter((check) => check.status === 'unknown')
  const completelyChecked = eligible && unknown.length === 0 && checks.length >= 6

  return (
    <aside className="rounded-2xl border border-border bg-surface p-5 shadow-[0_5px_24px_var(--color-shadow)] lg:sticky lg:top-24">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-4">
        <h2 className="text-xl font-bold text-text-primary">{t('builder.your_build')}</h2>
        <span className="text-xs text-text-muted">{t('builder.build_count', { count, total })}</span>
      </div>

      <div className="space-y-3 border-b border-border py-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-text-muted">{t('builder.compatibility')}</span>
          {conflicts.length ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-red-500"><FiAlertTriangle /> {t('common.conflicts', { count: conflicts.length })}</span>
          ) : completelyChecked ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-500"><FiCheckCircle /> {t('builder.compatible')}</span>
          ) : (
            <span className="font-medium text-amber-600 dark:text-amber-400">{count === 0 ? t('builder.not_checked') : t('builder.partially_checked')}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-text-muted">{t('builder.power')}</span>
          <span className="font-medium text-text-primary">{power !== null ? `≥ ${power} ${t('common.watts')}*` : t('builder.no_data')}</span>
        </div>
        {power !== null && <p className="text-xs text-text-muted">{t('builder.power_note')}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-text-muted">{t('builder.cost')}</span>
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
        <strong className="text-lg text-text-primary">{t('builder.total')}</strong>
        <strong className="text-2xl text-text-primary">{formatPrice(price)}</strong>
      </div>
      <button type="button" onClick={onAddToCart} disabled={!eligible}
        aria-describedby={!eligible ? 'builder-cart-validation' : undefined}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-default disabled:opacity-50 disabled:hover:bg-primary dark:text-[#08090C]">
        <FiShoppingCart className="h-5 w-5" /> {t('builder.add_to_cart')} <span aria-hidden="true">→</span>
      </button>
      {!eligible && (
        <p id="builder-cart-validation" role="alert" className="mt-2 text-xs text-red-500">
          {count < total && (
            <span className="block">{t('builder.cart_validation', { left: total - count, total })}</span>
          )}
          {conflicts.length > 0 && (
            <span className="block">{t('builder.compatibility_error', { conflicts: conflicts.map((check) => catalogDisplay(check.label)).join(', ') })}</span>
          )}
        </p>
      )}
      {eligible && unknown.length > 0 && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400" role="status">
          {t('builder.partial_check')}
        </p>
      )}

      <div className="mt-4 flex items-start gap-3 rounded-xl bg-surface-2 p-4">
        <FiShield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold text-text-primary">{t('builder.build_check_enabled')}</p>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">{t('builder.build_check_desc')}</p>
        </div>
      </div>
    </aside>
  )
}
