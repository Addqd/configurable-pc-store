import type { Review } from './productDetails'

const KEY_PREFIX = 'pc-builder-product-reviews:'
export const REVIEWS_UPDATED_EVENT = 'pc-builder-reviews-updated'

type OwnedReview = Review & { authorId?: string }

function isReview(value: unknown): value is OwnedReview {
  if (typeof value !== 'object' || value === null) return false
  const review = value as Partial<Review>
  return typeof review.id === 'number' && Number.isSafeInteger(review.id) &&
    typeof review.author === 'string' && review.author.trim().length > 0 &&
    typeof review.text === 'string' && review.text.trim().length > 0 &&
    typeof review.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(review.date) &&
    typeof review.rating === 'number' && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5
}

export function readProductReviews(slug: string): Review[] {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${slug}`)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isReview).slice(0, 100) : []
  } catch { return [] }
}

export function writeProductReviews(slug: string, reviews: Review[]): boolean {
  try {
    localStorage.setItem(`${KEY_PREFIX}${slug}`, JSON.stringify(reviews.slice(0, 100)))
    window.dispatchEvent(new Event(REVIEWS_UPDATED_EVENT))
    return true
  } catch { return false }
}

/** Counts only account-attributed reviews, never reviews matched by display name. */
export function countAccountReviews(accountId: string): number {
  let total = 0
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(KEY_PREFIX)) continue
      const slug = key.slice(KEY_PREFIX.length)
      total += readProductReviews(slug).filter((review) =>
        (review as OwnedReview).authorId === accountId).length
    }
  } catch { /* Storage may be disabled. */ }
  return total
}

/** Delete only reviews specifically attributed to the deleted demo account. */
export function removeAccountReviews(accountId: string): void {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(KEY_PREFIX)))
    for (const key of keys) {
      const slug = key.slice(KEY_PREFIX.length)
      const reviews = readProductReviews(slug)
      const retained = reviews.filter((review) => (review as OwnedReview).authorId !== accountId)
      if (retained.length !== reviews.length) writeProductReviews(slug, retained)
    }
  } catch { /* Demo storage might be unavailable. */ }
}
