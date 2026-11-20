import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FiImage, FiMove, FiPlus, FiRefreshCw, FiTrash2, FiX } from 'react-icons/fi'
import { galleryTile } from './adminStyles'

export interface GalleryItem {
  key: string
  id?: number
  url?: string
  file?: File
  previewUrl?: string
  altText?: string | null
  uploading?: boolean
  failed?: boolean
}

interface ProductGalleryEditorProps {
  items: GalleryItem[]
  max?: number
  disabled?: boolean
  onAddFiles: (files: File[]) => void
  onRemove: (key: string) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onRetry?: (key: string) => void
  error?: string | null
  errorHint?: string | null
}

const MAX_IMAGES = 10

/** 5×2 gallery with drag ordering; the first image is the cover. */
export function ProductGalleryEditor({
  items,
  max = MAX_IMAGES,
  disabled = false,
  onAddFiles,
  onRemove,
  onReorder,
  onRetry,
  error,
  errorHint,
}: ProductGalleryEditorProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const canAdd = items.length < max && !disabled

  const pickFiles = () => {
    if (canAdd) inputRef.current?.click()
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    onReorder(dragIndex, index)
    setDragIndex(null)
    setOverIndex(null)
  }

  const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const target = event.key === 'ArrowLeft' ? index - 1 : index + 1
    if (target < 0 || target >= items.length) return
    onReorder(index, target)
    const next = event.currentTarget.closest('[data-gallery-index]')?.parentElement?.querySelector<HTMLElement>(
      `[data-gallery-index="${target}"] button[data-gallery-move]`,
    )
    next?.focus()
  }

  const emptySlots = Math.max(0, max - items.length)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-text-secondary">{t('admin.form.gallery_hint')}</p>
        <p className="text-sm text-text-secondary">{t('admin.form.gallery_count', { count: items.length })}</p>
      </div>

      <div className="rounded-xl border border-dashed border-border p-3">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {items.map((item, index) => {
            const source = item.url ?? item.previewUrl
            return (
              <div
                key={item.key}
                data-gallery-index={index}
                draggable={!disabled}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => { event.preventDefault(); setOverIndex(index) }}
                onDragLeave={() => setOverIndex((current) => (current === index ? null : current))}
                onDrop={(event) => handleDrop(event, index)}
                onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
                className={`${galleryTile} bg-surface-3 ${
                  index === 0 ? 'border-primary' : 'border-border'
                } ${overIndex === index && dragIndex !== null && dragIndex !== index ? 'ring-2 ring-primary/50' : ''}`}
              >
                {source ? (
                  <img src={source} alt={item.altText ?? ''} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-text-muted">
                    <FiImage className="h-6 w-6" aria-hidden="true" />
                  </span>
                )}

                <div className="absolute left-1 top-1 flex items-center gap-1">
                  <button
                    type="button"
                    data-gallery-move
                    draggable={false}
                    disabled={disabled}
                    onKeyDown={(event) => moveWithKeyboard(event, index)}
                    aria-label={`${t('admin.form.gallery_drag_hint')} (${index + 1})`}
                    title={t('admin.form.gallery_drag_hint')}
                    className="inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-md bg-surface/90 text-text-secondary shadow-sm hover:text-text-primary disabled:cursor-not-allowed"
                  >
                    <FiMove className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onRemove(item.key)}
                  disabled={disabled || item.uploading}
                  aria-label={`${t('admin.form.gallery_remove')} (${index + 1})`}
                  className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md bg-surface/90 text-text-secondary shadow-sm transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FiX className="h-4 w-4" aria-hidden="true" />
                </button>

                {item.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                    <span className="sr-only">{t('admin.common.loading')}</span>
                  </div>
                )}

                {item.failed && !item.uploading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-danger-surface/95 px-1 text-center">
                    <span className="text-[11px] font-medium text-danger">{t('admin.form.gallery_upload_error')}</span>
                    {onRetry && (
                      <button
                        type="button"
                        onClick={() => onRetry(item.key)}
                        className="inline-flex items-center gap-1 rounded border border-danger-border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-danger"
                      >
                        <FiRefreshCw className="h-3 w-3" aria-hidden="true" />
                        {t('admin.form.retry_upload')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {Array.from({ length: emptySlots }, (_, offset) => {
            const isFirst = items.length === 0 && offset === 0
            return (
              <button
                key={`empty-${offset}`}
                type="button"
                onClick={pickFiles}
                disabled={!canAdd}
                aria-label={t('admin.form.gallery_add')}
                className={`${galleryTile} flex items-center justify-center bg-surface-3 text-text-muted transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 ${
                  isFirst ? 'border-primary' : 'border-border'
                }`}
              >
                <FiPlus className="h-5 w-5" aria-hidden="true" />
              </button>
            )
          })}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (files.length > 0) onAddFiles(files)
          }}
        />
      </div>

      <p className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
        <FiMove className="h-4 w-4 text-primary" aria-hidden="true" />
        {t('admin.form.gallery_drag_hint')}
      </p>

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-danger">
          <FiTrash2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {error}
            {errorHint && <span className="mt-1 block text-text-secondary">{errorHint}</span>}
          </span>
        </p>
      )}
    </div>
  )
}
