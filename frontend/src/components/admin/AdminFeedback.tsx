import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiInbox } from 'react-icons/fi'

export function AdminError({
  message,
  onRetry,
  compact = false,
}: {
  message?: string
  onRetry?: () => void
  compact?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 text-center text-sm text-text-secondary ${compact ? 'py-6' : 'py-14'}`}
    >
      <FiAlertCircle className="h-6 w-6 text-danger" aria-hidden="true" />
      <p>{message ?? t('admin.common.load_error')}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-border-hover hover:bg-surface-3"
        >
          {t('admin.common.retry')}
        </button>
      )}
    </div>
  )
}

export function AdminEmpty({ title, description }: { title?: string; description?: string }) {
  const { t } = useTranslation()
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <FiInbox className="h-8 w-8 text-text-muted" aria-hidden="true" />
      <p className="text-base font-medium text-text-primary">{title ?? t('admin.common.empty_title')}</p>
      <p className="text-sm text-text-muted">{description ?? t('admin.common.empty_desc')}</p>
    </div>
  )
}

export function AdminAlert({ message, tone = 'danger' }: { message: string; tone?: 'danger' | 'success' }) {
  const styles = tone === 'danger'
    ? 'border-danger-border bg-danger-surface text-danger'
    : 'border-border bg-surface-3 text-text-primary'
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {tone === 'success' && <span className="mr-2 text-success" aria-hidden="true">✓</span>}
      {message}
    </div>
  )
}
