import { useTranslation } from 'react-i18next'
import { FaStar } from 'react-icons/fa6'
import { StarRating } from '../StarRating'

export function StarsDisplay({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={className}>
      <StarRating rating={value} />
    </span>
  )
}

export function StarInput({
  value,
  onChange,
  disabled = false,
  id,
}: {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  id?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2" id={id} role="radiogroup" aria-label={t('admin.reviews.rating')}>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= value
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={t('admin.reviews.rating_option', { value: star })}
              disabled={disabled}
              onClick={() => onChange(star)}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                active ? 'text-amber-400' : 'text-border hover:text-amber-300'
              }`}
            >
              <FaStar className="h-5 w-5" aria-hidden="true" />
            </button>
          )
        })}
      </div>
      <span className="text-sm text-text-secondary">
        {t('admin.reviews.rating_value', { value })}
      </span>
    </div>
  )
}
