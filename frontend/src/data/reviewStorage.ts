import type { Review } from './productDetails'

const KEY_PREFIX = 'pc-builder-product-reviews:'

function isReview(value: unknown): value is Review {
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
  } catch {
    return [] // localStorage may be unavailable or contain old/invalid demo data
  }
}

export function writeProductReviews(slug: string, reviews: Review[]): boolean {
  try {
    localStorage.setItem(`${KEY_PREFIX}${slug}`, JSON.stringify(reviews.slice(0, 100)))
    return true
  } catch {
    return false // Submitted review remains available in the current page session
  }
}
