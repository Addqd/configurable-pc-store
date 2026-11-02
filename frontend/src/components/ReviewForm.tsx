import { useEffect, useRef, useState } from 'react'
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
  const nameInput = useRef<HTMLInputElement>(null)
  const modal = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    nameInput.current?.focus()
    return () => previous?.focus()
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    } else if (event.key === 'Tab') {
      const elements = modal.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled])')
      if (!elements?.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const name = author.trim()
    const body = text.trim()
    if (!name || !body) {
      setError('Укажите имя и текст отзыва')
      return
    }
    onSubmit({ author: name, rating, text: body })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
      onKeyDown={handleKeyDown}
    >
      <div ref={modal} className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="review-form-title">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="review-form-title" className="text-lg font-bold text-text-primary">Оставить отзыв</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary" aria-label="Закрыть форму">
            <FiX className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="review-author" className="mb-1 block text-sm font-medium text-text-primary">Имя</label>
            <input ref={nameInput} id="review-author" type="text" value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Как вас зовут" className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none" />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-text-primary">Оценка</legend>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = rating >= star
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    aria-label={`Оставить ${star} звёзд`}
                    aria-pressed={rating === star}
                    className={`inline-flex items-center justify-center p-0.5 transition-transform hover:scale-105 focus:outline-none ${active ? 'text-amber-400 dark:text-amber-300' : 'text-text-muted hover:text-amber-300'}`}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.77l-5.9 3.1.13-6.58L2.45 9.44l6.6-.96z" />
                    </svg>
                  </button>
                )
              })}
            </div>
          </fieldset>
          <div>
            <label htmlFor="review-text" className="mb-1 block text-sm font-medium text-text-primary">Текст отзыва</label>
            <textarea id="review-text" value={text} onChange={(event) => setText(event.target.value)} rows={4} placeholder="Поделитесь впечатлениями" className="w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none" />
          </div>
          {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-3">Отмена</button>
            <button type="submit" className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover dark:text-[#08090C]">Отправить</button>
          </div>
        </form>
      </div>
    </div>
  )
}
