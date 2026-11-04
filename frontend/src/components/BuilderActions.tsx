import { useBuilderStore } from '../stores/builderStore'
import { FiPlus, FiSave, FiTrash2 } from 'react-icons/fi'

interface BuilderActionsProps {
  onClear: () => void
  onSave: () => void
  onCreate: () => void
}

export function BuilderActions({ onClear, onSave, onCreate }: BuilderActionsProps) {
  return (
    <div className="space-y-2">
      {/* Primary action: Create build */}
      <button
        onClick={onCreate}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white transition-all hover:bg-primary-hover"
      >
        <FiPlus className="h-5 w-5" />
        Создать сборку
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
        </svg>
      </button>

      {/* Secondary actions */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onSave}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 text-sm text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary"
        >
          <FiSave className="h-4 w-4" />
          Сохранить сборку
        </button>
        <button
          onClick={onClear}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 text-sm text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary"
        >
          <FiTrash2 className="h-4 w-4" />
          Очистить
        </button>
      </div>
    </div>
  )
}
