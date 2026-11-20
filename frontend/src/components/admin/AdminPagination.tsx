import { useTranslation } from 'react-i18next'
import { adminSelect } from './adminStyles'

interface AdminPaginationProps {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  pageSizeOptions?: readonly number[]
}

function pageWindow(page: number, totalPages: number): Array<number | '…'> {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1)
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1])
  const sorted = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b)
  const result: Array<number | '…'> = []
  sorted.forEach((value, index) => {
    if (index > 0 && value - (sorted[index - 1] as number) > 1) result.push('…')
    result.push(value)
  })
  return result
}

export function AdminPagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
}: AdminPaginationProps) {
  const { t } = useTranslation()
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const safeTotalPages = Math.max(1, totalPages)
  const buttonClass =
    'flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-5 lg:flex-row lg:items-center lg:justify-between">
      <label className="flex items-center gap-2 text-sm text-text-primary">
        <span className="whitespace-nowrap">{t('admin.common.page_size')}</span>
        <span className="relative inline-flex">
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className={`${adminSelect} h-9 w-[78px] pr-7`}
            aria-label={t('admin.common.page_size')}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </label>

      <nav className="flex items-center justify-center gap-1.5" aria-label={t('admin.common.pages')}>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={`${buttonClass} border-border text-text-primary hover:bg-surface-3`}
          aria-label={t('admin.common.prev_page')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        {pageWindow(page, safeTotalPages).map((value, index) =>
          value === '…' ? (
            <span key={`dots-${index}`} className="px-1 text-text-muted">…</span>
          ) : (
            <button
              key={value}
              type="button"
              onClick={() => onPageChange(value)}
              aria-label={t('admin.common.page', { page: value })}
              aria-current={value === page ? 'page' : undefined}
              className={`${buttonClass} ${
                value === page
                  ? 'border-primary bg-primary-light text-primary'
                  : 'border-border text-text-primary hover:bg-surface-3'
              }`}
            >
              {value}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= safeTotalPages}
          className={`${buttonClass} border-border text-text-primary hover:bg-surface-3`}
          aria-label={t('admin.common.next_page')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </nav>

      <p className="text-center text-sm text-text-secondary lg:text-right">
        {t('admin.common.shown', { from, to, total })}
      </p>
    </div>
  )
}
