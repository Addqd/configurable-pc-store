import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { FiEdit2, FiPlus, FiTrash2 } from 'react-icons/fi'
import {
  useCreateReviewApiV1AdminProductsProductIdReviewsPost,
  useDeleteReviewApiV1AdminReviewsReviewIdDelete,
  useUpdateReviewApiV1AdminReviewsReviewIdPatch,
} from '../../api/generated/client'
import type { AdminReviewOut, AdminReviewUpdate } from '../../api/generated/model'
import { adminErrorText, isoDate } from '../../admin/params'
import { invalidateAfterReviewChange } from '../../admin/queryInvalidation'
import { AdminDialog, AdminDialogClose } from './AdminDialog'
import { useDialogTitleId } from './useDialogTitleId'
import { DeleteConfirmationModal } from './DeleteConfirmationModal'
import { StarInput } from './Stars'
import { TextField, TextareaField, Toggle } from './AdminFields'
import { adminPrimaryButton, adminSecondaryButton } from './adminStyles'

interface ReviewEditorProps {
  productId: number
  /** `null` opens a fresh create form; a review opens edit mode. */
  review: AdminReviewOut | null
  onClose: () => void
  onSaved: (message: string) => void
  onDeleted: () => void
}

interface ReviewFormState {
  author: string
  rating: number
  body: string
  date: string
  time: string
  isPublished: boolean
  storeReply: string
}

function splitLocalDate(value: string | null): { date: string; time: string } {
  const date = value ? new Date(value) : new Date()
  const safe = Number.isNaN(date.getTime()) ? new Date() : date
  return {
    date: isoDate(safe),
    time: `${String(safe.getHours()).padStart(2, '0')}:${String(safe.getMinutes()).padStart(2, '0')}`,
  }
}

function initialState(review: AdminReviewOut | null): ReviewFormState {
  const { date, time } = splitLocalDate(review?.displayed_at ?? null)
  return {
    author: review?.author_name ?? review?.reviewer_name ?? '',
    rating: review?.rating ?? 0,
    body: review?.body ?? '',
    date,
    time,
    isPublished: review?.is_published ?? true,
    storeReply: review?.store_reply ?? '',
  }
}

function combineDate(date: string, time: string): string | null {
  if (!date || !time) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  const value = new Date(year, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

/**
 * One reusable review form for both modes, presented as a compact dialog.
 * Creation starts from empty fields with the current local date/time and no
 * delete action; editing is populated from the selected review and respects
 * customer-authored content limits. The `displayed_at` timestamp is only sent
 * when the date/time controls actually changed, so editing other fields keeps
 * the stored seconds intact.
 */
export function ReviewEditor({ productId, review, onClose, onSaved, onDeleted }: ReviewEditorProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = review !== null
  const lockedContent = review !== null && review.source !== 'admin'
  const [initial] = useState(() => initialState(review))
  const [form, setForm] = useState<ReviewFormState>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const titleId = useDialogTitleId('review-editor-dialog')

  const invalidate = () => invalidateAfterReviewChange(queryClient)

  const createReview = useCreateReviewApiV1AdminProductsProductIdReviewsPost()
  const updateReview = useUpdateReviewApiV1AdminReviewsReviewIdPatch()
  const deleteReview = useDeleteReviewApiV1AdminReviewsReviewIdDelete()
  const pending = createReview.isPending || updateReview.isPending
  const timestampChanged = form.date !== initial.date || form.time !== initial.time

  const setField = <K extends keyof ReviewFormState>(key: K, value: ReviewFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: '' }))
    setServerError(null)
  }

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!lockedContent && !form.author.trim()) next.author = t('admin.reviews.validation_author')
    if (!lockedContent && (form.rating < 1 || form.rating > 5)) next.rating = t('admin.reviews.validation_rating')
    if (!lockedContent && !form.body.trim()) next.body = t('admin.reviews.validation_body')
    if (!form.date || !form.time || combineDate(form.date, form.time) === null) {
      next.date = t('admin.errors.validation')
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    if (pending) return
    setServerError(null)
    if (!validate()) return
    try {
      if (!review) {
        const displayedAt = combineDate(form.date, form.time)
        if (!displayedAt) return
        await createReview.mutateAsync({
          productId,
          data: {
            author_name: form.author.trim(),
            rating: form.rating,
            body: form.body.trim(),
            is_published: form.isPublished,
            displayed_at: displayedAt,
            store_reply: form.storeReply.trim() || null,
          },
        })
        void invalidate()
        onClose()
        onSaved(t('admin.reviews.created'))
        return
      }

      const data: AdminReviewUpdate = {
        is_published: form.isPublished,
        store_reply: form.storeReply.trim() || null,
      }
      if (!lockedContent) {
        data.author_name = form.author.trim()
        data.rating = form.rating
        data.body = form.body.trim()
      }
      if (timestampChanged) {
        const displayedAt = combineDate(form.date, form.time)
        if (!displayedAt) return
        data.displayed_at = displayedAt
      }
      await updateReview.mutateAsync({ reviewId: review.id, data })
      void invalidate()
      onClose()
      onSaved(t('admin.reviews.saved'))
    } catch (error) {
      setServerError(adminErrorText(error))
    }
  }

  const remove = async () => {
    if (!review || deleteReview.isPending) return
    setServerError(null)
    try {
      await deleteReview.mutateAsync({ reviewId: review.id })
      setConfirmDelete(false)
      void invalidate()
      onClose()
      onDeleted()
    } catch (error) {
      setServerError(adminErrorText(error))
    }
  }

  return (
    <AdminDialog
      open
      onClose={onClose}
      closeDisabled={pending}
      labelledBy={titleId}
      widthClass="max-w-[620px]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {editing
            ? <FiEdit2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            : <FiPlus className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
          <h2 id={titleId} className="text-lg font-semibold text-text-primary sm:text-xl">
            {editing ? t('admin.reviews.edit_title') : t('admin.reviews.create_title')}
          </h2>
        </div>
        <AdminDialogClose onClick={onClose} disabled={pending} />
      </div>

      <div className="mt-4 border-t border-border pt-4">
        {lockedContent && (
          <p className="mb-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-secondary">
            {t('admin.reviews.customer_locked')}
          </p>
        )}
        {review?.source === 'admin' && (
          <p className="mb-3 text-xs text-text-muted">{t('admin.reviews.admin_source')}</p>
        )}

        <div className="space-y-3.5">
          <TextField
            id="review-author"
            label={t('admin.reviews.author')}
            required
            value={form.author}
            maxLength={120}
            disabled={lockedContent || pending}
            error={errors.author}
            onChange={(event) => setField('author', event.target.value)}
          />

          <div>
            <p className="mb-1.5 block text-sm font-medium text-text-primary">
              {t('admin.reviews.rating')} <span className="text-text-secondary" aria-hidden="true">*</span>
            </p>
            <StarInput
              value={form.rating}
              onChange={(value) => setField('rating', value)}
              disabled={lockedContent || pending}
              required
            />
            {errors.rating && <p className="mt-1.5 text-xs text-danger" role="alert">{errors.rating}</p>}
          </div>

          <TextareaField
            id="review-body"
            label={t('admin.reviews.body')}
            required
            value={form.body}
            maxLength={5000}
            rows={3}
            disabled={lockedContent || pending}
            error={errors.body}
            onChange={(event) => setField('body', event.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="review-date"
              label={t('admin.reviews.date')}
              type="date"
              value={form.date}
              disabled={pending}
              error={errors.date}
              onChange={(event) => setField('date', event.target.value)}
            />
            <TextField
              id="review-time"
              label={t('admin.reviews.time')}
              type="time"
              value={form.time}
              disabled={pending}
              onChange={(event) => setField('time', event.target.value)}
            />
          </div>

          <Toggle
            id="review-published"
            label={t('admin.reviews.publication')}
            description={form.isPublished ? t('admin.reviews.published') : t('admin.reviews.hidden')}
            checked={form.isPublished}
            disabled={pending}
            onChange={(checked) => setField('isPublished', checked)}
          />

          <TextareaField
            id="review-reply"
            label={t('admin.reviews.store_reply')}
            value={form.storeReply}
            maxLength={2000}
            rows={2}
            placeholder={t('admin.reviews.store_reply_placeholder')}
            disabled={pending}
            onChange={(event) => setField('storeReply', event.target.value)}
          />
        </div>

        {serverError && (
          <p role="alert" className="mt-3 rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger">
            {serverError}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {editing && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-danger-border bg-surface px-4 text-sm font-medium text-danger transition-colors hover:bg-danger-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                {t('admin.reviews.delete')}
              </button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={pending} className={adminSecondaryButton}>
              {t('admin.common.cancel')}
            </button>
            <button type="button" onClick={() => void submit()} disabled={pending} className={adminPrimaryButton}>
              {pending
                ? t('admin.common.saving')
                : editing ? t('admin.reviews.submit_save') : t('admin.reviews.submit_create')}
            </button>
          </div>
        </div>
      </div>

      <DeleteConfirmationModal
        open={confirmDelete}
        title={t('admin.reviews.delete_title')}
        description={t('admin.reviews.delete_desc')}
        warning={t('admin.reviews.delete_warning')}
        note={t('admin.reviews.delete_note')}
        confirmLabel={t('admin.reviews.delete_confirm')}
        pending={deleteReview.isPending}
        error={deleteReview.isError ? adminErrorText(deleteReview.error) : null}
        onCancel={() => { if (!deleteReview.isPending) { setConfirmDelete(false); deleteReview.reset() } }}
        onConfirm={() => void remove()}
      />
    </AdminDialog>
  )
}
