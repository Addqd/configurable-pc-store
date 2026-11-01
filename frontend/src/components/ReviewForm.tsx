import { useState } from 'react'
import { FiX } from 'react-icons/fi'

export interface NewReview {
  author: string
  rating: number
  text: string
}

interface ReviewFormProps {
  onSubmit: (review: NewReview) => void
  onClose: () => void
}

export function ReviewForm({ onSubmit, onClose }: ReviewFormProps) {
  const [author, setAuthor] = useState('')
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    const name = author.trim()
    const body = text.trim()
    if (!name || !body) {
      setError('Укажите имя и текст отзыва')
      return
    }
    onSubmit({ author: name, rating, text: body })
    setAuthor('')
    setRating(5)
    setText('')
    setError('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface p-5 sm:p-6" role="dialog" aria-modal="true" aria-label="Оставить отзыв">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-text-primary">Оставить отзыв</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
            aria-label="Закрыть форму"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">Имя</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Как вас зовут"
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">Оценка</label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  aria-label={`Оставить ${star} звёзд`}
                  className={[
                    'h-7 w-7 rounded-md border transition-colors',
                    rating >= star
                      ? 'border-amber-400 bg-amber-400'
                      : 'border-border bg-surface-2 hover:border-border-hover',
                  ].join(' ')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={rating >= star ? 'currentColor' : 'none'} className="text-amber-400">
                    <path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.77l-5.9 3.1.13-6.58L2.45 9.44l6.6-.96z" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">Текст отзыва</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Поделитесь впечатлениями"
              className="w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-rose-500">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-3"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={submit}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
