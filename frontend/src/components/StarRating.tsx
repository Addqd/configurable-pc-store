interface StarRatingProps {
  rating: number
  count?: number
}

const MAX_STARS = 5

export function StarRating({ rating, count }: StarRatingProps) {
  const safeRating = Math.max(0, Math.min(MAX_STARS, rating))

  return (
    <div className="flex items-center gap-2" aria-label={`Рейтинг ${safeRating.toFixed(1)} из ${MAX_STARS}`}>
      <div className="flex items-center gap-1">
        {Array.from({ length: MAX_STARS }, (_, index) => {
          const fill = Math.max(0, Math.min(1, safeRating - index)) * 100
          return <FractionalStar key={index} fill={fill} />
        })}
      </div>
      {typeof count === 'number' && (
        <span className="text-sm text-text-muted">{count} {pluralizeReviews(count)}</span>
      )}
    </div>
  )
}

function FractionalStar({ fill }: { fill: number }) {
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0">
      <StarIcon className="h-4 w-4 text-border" fill="none" />
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill}%` }}>
        <StarIcon className="h-4 w-4 text-amber-400" fill="currentColor" />
      </span>
    </span>
  )
}

function StarIcon({ className, fill }: { className?: string; fill: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.77l-5.9 3.1.13-6.58L2.45 9.44l6.6-.96z" />
    </svg>
  )
}

function pluralizeReviews(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return 'отзыв'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'отзыва'
  return 'отзывов'
}
