import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { CompatibilityStatus } from '../api/generated/model'
import { compatibilityCheckName, compatibilityExplanation, conflictRows } from '../data/compatibilityMessages'
import { FiAlertTriangle, FiX } from 'react-icons/fi'

interface BuilderConflictsModalProps {
  conflicts: CompatibilityStatus[]
  onClose: () => void
}

/**
 * Detailed incompatibility report of one explicit compatibility check.
 *
 * Every conflict shows the affected components, the selected products, the
 * characteristics that were compared and their values, plus a localized
 * explanation. Nothing here is derived from the server's English `message`: the
 * statement is built from the structured `details` of the response.
 */
export function BuilderConflictsModal({ conflicts, onClose }: BuilderConflictsModalProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'ru'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="builder-conflicts-title"
        aria-describedby="builder-conflicts-desc"
        className="flex max-h-[calc(100dvh-32px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 id="builder-conflicts-title" className="flex items-center gap-2 text-lg font-bold text-text-primary">
              <FiAlertTriangle className="h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
              {t('builder.conflicts_title')}
            </h2>
            <p id="builder-conflicts-desc" className="mt-1 text-sm text-text-muted">
              {t('builder.conflicts_desc', { count: conflicts.length })}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary">
            <FiX className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <ul className="space-y-3">
            {conflicts.map((conflict, index) => (
              <li key={`${conflict.slot}-${index}`} className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                <h3 className="text-sm font-bold text-text-primary first-letter:uppercase">{compatibilityCheckName(conflict.slot, t)}</h3>
                <dl className="mt-2 space-y-2">
                  {conflictRows(conflict, t, language).map((row, rowIndex) => (
                    <div key={`${row.component}-${row.characteristic}-${rowIndex}`}
                      className="grid gap-0.5 text-xs sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-3">
                      <dt className="text-text-muted">{row.component}</dt>
                      <dd className="min-w-0 break-words text-text-primary">
                        <span className="font-semibold">{row.product}</span>
                        <span className="text-text-muted"> · {row.characteristic}: </span>
                        <span className="font-medium">{row.value}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-red-500">{compatibilityExplanation(conflict.slot, t)}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end border-t border-border px-6 py-4">
          <button type="button" autoFocus onClick={onClose}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover dark:text-[#08090C]">
            {t('builder.conflicts_close')}
          </button>
        </div>
      </div>
    </div>
  )
}
