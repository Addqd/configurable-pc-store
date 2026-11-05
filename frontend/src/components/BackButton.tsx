import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { FiArrowLeft } from 'react-icons/fi'

interface BackButtonProps {
  className?: string
}

/** Return to the preceding React Router history entry, preserving SPA navigation. */
export function BackButton({ className = '' }: BackButtonProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      className={`pc-hover-link inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-text-muted transition-colors hover:text-primary ${className}`.trim()}
      aria-label={t('common.back')}
      title={t('common.back_title')}
    >
      <FiArrowLeft className="h-4 w-4" />
      {t('common.back')}
    </button>
  )
}
