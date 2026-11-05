import { useTranslation } from 'react-i18next'
import { FiPlus, FiSave, FiTrash2 } from 'react-icons/fi'

interface BuilderActionsProps {
  onClear: () => void
  onCreate: () => void
  onSave?: () => void
  hasSelections?: boolean
  canCreate: boolean
  validationMessage?: string
}

export function BuilderActions({ onClear, onCreate, onSave, hasSelections = false, canCreate, validationMessage }: BuilderActionsProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <button type="button" onClick={onCreate} disabled={!canCreate}
        aria-describedby={!canCreate && validationMessage ? 'builder-create-validation' : undefined}
        className="flex w-full items-center justify-center gap-3 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-default disabled:opacity-50 disabled:hover:bg-primary dark:text-[#08090C]">
        <FiPlus className="h-4 w-4" /> {t('builder.create')} <span aria-hidden="true">→</span>
      </button>
      {!canCreate && validationMessage && (
        <p id="builder-create-validation" role="alert" className="px-1 text-xs text-red-500">{validationMessage}</p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" onClick={onSave} disabled={!canCreate || !onSave}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text-primary transition-colors hover:bg-surface-3 hover:text-primary disabled:cursor-default disabled:opacity-60 disabled:hover:bg-surface-2 disabled:hover:text-text-primary">
          <FiSave className="h-4 w-4" /> {t('builder.save_build')}
        </button>
        <button type="button" onClick={onClear} disabled={!hasSelections}
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text-primary transition-colors hover:bg-surface-3 hover:text-primary disabled:cursor-default disabled:opacity-50 disabled:hover:bg-surface-2 disabled:hover:text-text-primary">
          <FiTrash2 className="h-4 w-4" /> {t('builder.clear')}
        </button>
      </div>
    </div>
  )
}
