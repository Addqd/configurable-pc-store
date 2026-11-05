import { demoReviewDisplay } from '../i18n/catalogDisplay'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { ReviewForm, type NewReview } from './ReviewForm'
import { StarRating } from './StarRating'
import type { Review } from '../data/productDetails'

export type ReviewSort = 'newest' | 'oldest' | 'rating'

interface ProductReviewsProps {
  reviews: Review[]
  rating: number
  reviewCount: number
  sort: ReviewSort
  onSortChange: (sort: ReviewSort) => void
  onAddReview: (review: NewReview) => void
}

export function ProductReviews({ reviews, rating, reviewCount, sort, onSortChange, onAddReview }: ProductReviewsProps) {
  const { t } = useTranslation()
  const [openForm, setOpenForm] = useState(false)
  const sorted = [...reviews].sort((a, b) => {
    if (sort === 'newest') return b.date.localeCompare(a.date)
    if (sort === 'oldest') return a.date.localeCompare(b.date)
    return b.rating - a.rating
  })

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="text-4xl font-bold text-text-primary">{reviewCount > 0 ? rating.toFixed(1) : '—'}</span>
          <div className="flex flex-col">
            <StarRating rating={rating} />
            <span className="mt-1 text-xs text-text-muted">{t('product.reviews.review_count', { count: reviewCount })}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setOpenForm(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary-light"
          >{t('product.reviews.write')}</button>
          <label className="relative inline-flex min-w-[140px] items-center justify-between overflow-hidden rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary">
            <span>{t('product.reviews.sort_' + sort)}</span>
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as ReviewSort)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label={t('product.reviews.sort_label')}
            >
              <option value="newest">{t('product.reviews.sort_newest')}</option>
              <option value="oldest">{t('product.reviews.sort_oldest')}</option>
              <option value="rating">{t('product.reviews.sort_rating')}</option>
            </select>
          </label>
        </div>
      </div>

      <p className="mb-4 text-xs text-text-muted">{t('product.reviews.note')}</p>
      {sorted.length === 0 ? (
        <p className="py-5 text-sm text-text-muted">{t('product.reviews.empty')}</p>
      ) : (
        <div className="space-y-4">
          {sorted.map((review) => (
            <article key={review.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary">
                  {initials(review.author)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">{review.author}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StarRating rating={review.rating} />
                  <span className="hidden text-xs text-text-muted sm:block">{review.date}</span>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">{demoReviewDisplay(review.text)}</p>
            </article>
          ))}
        </div>
      )}
      {openForm && <ReviewForm onSubmit={onAddReview} onClose={() => setOpenForm(false)} />}
    </section>
  )
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).map((word) => word[0]?.toUpperCase() ?? '').join('').slice(0, 2)
}

