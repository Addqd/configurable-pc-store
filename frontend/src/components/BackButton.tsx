import { useNavigate } from 'react-router'
import { FiArrowLeft } from 'react-icons/fi'

interface BackButtonProps {
  className?: string
}

/** Mirrors browser Back: return to the preceding history entry, never to a hard-coded route. */
export function BackButton({ className = '' }: BackButtonProps) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      className={`pc-hover-link inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-text-muted transition-colors hover:text-primary ${className}`.trim()}
      aria-label="Назад"
      title="Вернуться на предыдущую страницу"
    >
      <FiArrowLeft className="h-4 w-4" />
      Назад
    </button>
  )
}
