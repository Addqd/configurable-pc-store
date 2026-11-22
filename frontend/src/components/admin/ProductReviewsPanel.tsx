import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiEdit2, FiPlus, FiSearch } from 'react-icons/fi'
import { useListReviewsApiV1AdminReviewsGet } from '../../api/generated/client'
import type { AdminReviewOut } from '../../api/generated/model'
import { adminErrorText, MAX_SEARCH_LENGTH, type AdminReviewSort } from '../../admin/params'
import { useDebouncedValue } from '../../utils/useDebouncedValue'
import { AdminEmpty, AdminError } from './AdminFeedback'
import { AdminTableSkeleton } from '../skeletons/AdminSkeletons'
import { AdminPagination } from './AdminPagination'
import { ReviewEditor } from './ReviewEditor'
import { StarsDisplay } from './Stars'
import { adminControl, adminPrimaryButton, adminSelect, adminTableHead, adminTableHeadCell, adminTableCell } from './adminStyles'

const STATUSES = ['all', 'published', 'unpublished'] as const
const RATINGS = ['', '5', '4', '3', '2', '1'] as const
const SORTS: readonly AdminReviewSort[] = ['displayed_desc', 'displayed_asc', 'rating_desc', 'created_desc', 'created_asc']

type EditorState =
  | { id: string; mode: 'create' }
  | { id: string; mode: 'edit'; review: AdminReviewOut }
  | null

let editorSequence = 0
const nextEditorId = () => `review-editor-${++editorSequence}`

export function ProductReviewsPanel({ productId }: { productId: number }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all')
  const [rating, setRating] = useState('')
  const [sort, setSort] = useState<AdminReviewSort>('displayed_desc')
  const [search, setSearch] = useState('')
  const query = useDebouncedValue(search, 300)
  const [editor, setEditor] = useState<EditorState>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reviews = useListReviewsApiV1AdminReviewsGet({
    product_id: productId,
    page,
    page_size: pageSize,
    q: query || undefined,
    status,
    min_rating: rating ? Number(rating) : undefined,
    max_rating: rating ? Number(rating) : undefined,
    sort,
  })

  const total = reviews.data?.total ?? 0
  const totalPages = reviews.data?.total_pages ?? 1

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    setPage(1)
    setNotice(null)
  }

  const openEditor = (next: { mode: 'create' } | { mode: 'edit'; review: AdminReviewOut }) => {
    setNotice(null)
    setEditor({ ...next, id: nextEditorId() })
  }

  /**
   * Completion handlers are bound to the editor that started the request: a slow
   * mutation for review A must not close the editor that was opened for review B.
   */
  const closeEditor = (editorId: string) => {
    setEditor((current) => (current?.id === editorId ? null : current))
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-text-primary">{t('admin.reviews.title')}</h2>
        <button
          type="button"
          onClick={() => openEditor({ mode: 'create' })}
          className={adminPrimaryButton}
        >
          <FiPlus className="h-4 w-4" aria-hidden="true" />
          {t('admin.reviews.add')}
        </button>
      </div>

      {notice && (
        <p role="status" className="mt-4 rounded-lg border border-border bg-surface-3 px-3 py-2 text-sm text-text-primary">
          <span className="mr-2 text-success" aria-hidden="true">✓</span>{notice}
        </p>
      )}

      <div className="mt-4 space-y-3">
        <div className="relative">
          <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            type="search"
            value={search}
            maxLength={MAX_SEARCH_LENGTH}
            onChange={(event) => { setSearch(event.target.value); setPage(1) }}
            placeholder={t('admin.reviews.search_placeholder')}
            aria-label={t('admin.reviews.search_label')}
            className={`${adminControl} pl-10`}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="relative">
            <span className="sr-only">{t('admin.reviews.all_ratings')}</span>
            <select
              value={rating}
              onChange={(event) => resetPage(setRating)(event.target.value)}
              className={adminSelect}
            >
              <option value="">{t('admin.reviews.all_ratings')}</option>
              {RATINGS.slice(1).map((value) => (
                <option key={value} value={value}>{value} ★</option>
              ))}
            </select>
            <Chevron />
          </label>
          <label className="relative">
            <span className="sr-only">{t('admin.reviews.all_statuses')}</span>
            <select
              value={status}
              onChange={(event) => resetPage(setStatus)(
                STATUSES.includes(event.target.value as (typeof STATUSES)[number])
                  ? (event.target.value as (typeof STATUSES)[number])
                  : 'all',
              )}
              className={adminSelect}
            >
              <option value="all">{t('admin.reviews.all_statuses')}</option>
              <option value="published">{t('admin.reviews.published')}</option>
              <option value="unpublished">{t('admin.reviews.hidden')}</option>
            </select>
            <Chevron />
          </label>
          <label className="relative">
            <span className="sr-only">{t('admin.reviews.sort_displayed_desc')}</span>
            <select
              value={sort}
              onChange={(event) => resetPage(setSort)(event.target.value as AdminReviewSort)}
              className={adminSelect}
            >
              {SORTS.map((value) => (
                <option key={value} value={value}>{t(`admin.reviews.sort_${value}`)}</option>
              ))}
            </select>
            <Chevron />
          </label>
        </div>
      </div>

      {editor && (
        <ReviewEditor
          key={editor.id}
          productId={productId}
          review={editor.mode === 'edit' ? editor.review : null}
          onClose={() => closeEditor(editor.id)}
          onSaved={(message) => { setPage(1); setNotice(message) }}
          onDeleted={() => { setPage(1); setNotice(t('admin.reviews.deleted')) }}
        />
      )}

      <div className="mt-5">
        {reviews.isError ? (
          <AdminError message={adminErrorText(reviews.error)} onRetry={() => void reviews.refetch()} compact />
        ) : reviews.isLoading ? (
          <AdminTableSkeleton
            columns={[
              { widthClass: 'w-[34%]', contentClass: 'h-4 w-40' },
              { widthClass: 'w-[22%]', contentClass: 'h-4 w-24' },
              { widthClass: 'w-[20%]', contentClass: 'h-4 w-20' },
              { contentClass: 'h-10 w-28' },
            ]}
            rows={6}
          />
        ) : total === 0 ? (
          <AdminEmpty
            title={t('admin.reviews.empty_title')}
            description={query || rating || status !== 'all' ? t('admin.common.empty_desc') : t('admin.reviews.empty_desc')}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className={adminTableHead}>
                    <th scope="col" className={`${adminTableHeadCell} w-[34%]`}>{t('admin.reviews.col_client')}</th>
                    <th scope="col" className={`${adminTableHeadCell} w-[22%]`}>{t('admin.reviews.col_rating')}</th>
                    <th scope="col" className={`${adminTableHeadCell} w-[20%]`}>{t('admin.reviews.col_status')}</th>
                    <th scope="col" className={adminTableHeadCell}>{t('admin.reviews.col_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.data?.items.map((review) => (
                    <tr key={review.id} className="border-b border-border last:border-0">
                      <td className={`${adminTableCell} text-sm text-text-primary`}>{review.reviewer_name}</td>
                      <td className={adminTableCell}><StarsDisplay value={review.rating} /></td>
                      <td className={adminTableCell}>
                        <span className={`text-sm ${review.is_published ? 'text-success' : 'text-text-muted'}`}>
                          {review.is_published ? t('admin.reviews.published') : t('admin.reviews.hidden')}
                        </span>
                      </td>
                      <td className={adminTableCell}>
                        <button
                          type="button"
                          onClick={() => openEditor({ mode: 'edit', review })}
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:border-border-hover hover:bg-surface-3"
                        >
                          <FiEdit2 className="h-4 w-4" aria-hidden="true" />
                          {t('admin.reviews.edit')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <AdminPagination
                page={page}
                pageSize={pageSize}
                total={total}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Chevron() {
  return (
    <svg
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
