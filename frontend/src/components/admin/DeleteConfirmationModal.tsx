import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FiAlertTriangle, FiTrash2 } from 'react-icons/fi'
import { AdminDialog, AdminDialogClose } from './AdminDialog'
import { useDialogTitleId } from './useDialogTitleId'

export interface DeleteConfirmationModalProps {
  open: boolean
  title: string
  description: ReactNode
  /** Red irreversible-action warning. */
  warning: ReactNode
  /** Muted explanatory note, e.g. the audit-journal line. */
  note?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  pending?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: () => void
}

/**
 * The single shared destructive-confirmation dialog. User deletion, review
 * deletion, product deactivation and image removal all use this component and
 * differ only by contextual content and handlers.
 */
export function DeleteConfirmationModal({
  open,
  title,
  description,
  warning,
  note,
  confirmLabel,
  cancelLabel,
  pending = false,
  error,
  onCancel,
  onConfirm,
}: DeleteConfirmationModalProps) {
  const { t } = useTranslation()
  const titleId = useDialogTitleId('delete-dialog')
  return (
    <AdminDialog
      open={open}
      onClose={onCancel}
      closeDisabled={pending}
      labelledBy={titleId}
      widthClass="max-w-[620px]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <FiTrash2 className="h-6 w-6 shrink-0 text-danger" aria-hidden="true" />
          <h2 id={titleId} className="text-xl font-bold text-text-primary sm:text-2xl">{title}</h2>
        </div>
        <AdminDialogClose onClick={onCancel} disabled={pending} />
      </div>

      <div className="mt-7 space-y-5 text-sm leading-relaxed text-text-primary sm:text-base">
        <p>{description}</p>
        <p className="flex items-start gap-3 font-medium text-danger">
          <FiAlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{warning}</span>
        </p>
        {note && <p className="text-text-secondary">{note}</p>}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-surface px-6 text-sm font-medium text-text-primary transition-colors hover:border-border-hover hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {cancelLabel ?? t('admin.common.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FiTrash2 className="h-4 w-4" aria-hidden="true" />
          {pending ? t('admin.common.deleting') : confirmLabel}
        </button>
      </div>
    </AdminDialog>
  )
}
