interface StarRatingProps {
  rating: number
  count?: number
  size?: 'sm' | 'md'
  'aria-label'?: string
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      className={[filled ? 'text-amber-400' : 'text-border'].join(' ')}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.77l-5.9 3.1.13-6.58L2.45 9.44l6.6-.96z" />
    </svg>
  )
}

export function StarRating({ rating, count, size = 'sm', 'aria-label': ariaLabel }: StarRatingProps) {
  const dim = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  const full = Math.round(rating)
  return (
    <div className="inline-flex items-center gap-1" aria-label={ariaLabel ?? `Оценка ${rating} из 5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} className={[dim, 'inline-flex'].join(' ')}>
          <Star filled={index < full} />
        </span>
      ))}
      {typeof count === 'number' && (
        <span className="ml-1.5 text-xs text-text-muted">{count} отзыв{plural(count)}</span>
      )}
    </div>
  )
}

function plural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return ''
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'а'
  return 'ов'
}
