import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiCheckCircle, FiSearch, FiX } from 'react-icons/fi'
import {
  useGetFilterOptionsApiV1AdminEventsFiltersGet,
  useListEventsApiV1AdminEventsGet,
} from '../../api/generated/client'
import { adminErrorText, MAX_SEARCH_LENGTH, readEnum, readPageSize, readPositiveInt, readSearchQuery, readText, withParams } from '../../admin/params'
import { useSyncedDraft } from '../../utils/useSyncedDraft'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { AdminEmpty, AdminError } from '../../components/admin/AdminFeedback'
import { AdminTableSkeleton } from '../../components/skeletons/AdminSkeletons'
import { AdminPagination } from '../../components/admin/AdminPagination'
import { DateFilterField } from '../../components/admin/DateFilterField'
import {
  adminCard, adminControl, adminSelect, adminTableHead, adminTableHeadCell, adminTableCell,
} from '../../components/admin/adminStyles'
import {
  eventActorId, eventActorName, eventActorRole, eventCategoryLabel, eventDetailsLine, eventOutcomeLabel,
  eventTypeLabel, formatEventTime,
} from './eventDisplay'

const CATEGORIES = ['auth', 'account', 'order', 'build', 'review', 'admin', 'catalog', 'system'] as const
const OUTCOMES = ['success', 'failure'] as const
const SORTS = ['occurred_desc', 'occurred_asc'] as const

export function AdminEventsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const urlQuery = readSearchQuery(searchParams)
  const [searchDraft, setSearchDraft] = useSyncedDraft(urlQuery, (value) => {
    setSearchParams((current) => withParams(current, { q: value, page: 1 }), { replace: true })
  })
  const category = readText(searchParams, 'category')
  const outcome = readText(searchParams, 'outcome')
  const sort = readEnum(searchParams, 'sort', SORTS, 'occurred_desc')
  const dateFrom = readText(searchParams, 'date_from')
  const dateTo = readText(searchParams, 'date_to')
  const page = readPositiveInt(searchParams, 'page', 1)
  const pageSize = readPageSize(searchParams)
  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)

  // The date fields keep their own unapplied draft, so the reset button has to
  // know about more than the URL: an invalid date can be typed while no date
  // filter is applied at all. The token is what actually clears those drafts.
  const [dateDrafts, setDateDrafts] = useState({ from: false, to: false })
  const [dateResetToken, setDateResetToken] = useState(0)
  const reportDraftFrom = useCallback((hasDraft: boolean) => {
    setDateDrafts((current) => (current.from === hasDraft ? current : { ...current, from: hasDraft }))
  }, [])
  const reportDraftTo = useCallback((hasDraft: boolean) => {
    setDateDrafts((current) => (current.to === hasDraft ? current : { ...current, to: hasDraft }))
  }, [])
  const resetDates = () => {
    setDateDrafts({ from: false, to: false })
    setDateResetToken((token) => token + 1)
    setSearchParams((current) => withParams(current, { date_from: '', date_to: '', page: 1 }))
  }
  const hasDateDraft = dateDrafts.from || dateDrafts.to

  const filterOptions = useGetFilterOptionsApiV1AdminEventsFiltersGet()
  const events = useListEventsApiV1AdminEventsGet(
    {
      page,
      page_size: pageSize,
      q: urlQuery || undefined,
      category: CATEGORIES.includes(category as (typeof CATEGORIES)[number])
        ? (category as (typeof CATEGORIES)[number])
        : undefined,
      outcome: OUTCOMES.includes(outcome as (typeof OUTCOMES)[number])
        ? (outcome as (typeof OUTCOMES)[number])
        : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      sort,
    },
    { query: { enabled: !invalidRange, retry: false } },
  )

  const total = events.data?.total ?? 0
  const totalPages = events.data?.total_pages ?? 1
  useEffect(() => {
    if (events.data && page > totalPages) {
      setSearchParams((current) => withParams(current, { page: totalPages }), { replace: true })
    }
  }, [events.data, page, totalPages, setSearchParams])

  return (
    <AdminLayout footer={false}>
      <section className={`${adminCard} mx-auto w-full max-w-[1040px] px-5 py-6 sm:px-8 sm:py-7`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" />
              </svg>
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">{t('admin.events.title')}</h1>
              <p className="mt-0.5 text-sm text-text-secondary">{t('admin.events.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            aria-label={t('admin.events.close')}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <div className="relative">
            <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              maxLength={MAX_SEARCH_LENGTH}
              placeholder={t('admin.events.search_placeholder')}
              aria-label={t('admin.events.search_label')}
              className={`${adminControl} pl-10`}
            />
            {searchDraft.length >= MAX_SEARCH_LENGTH && (
              <p className="mt-1 text-xs text-text-muted">
                {t('admin.common.search_limit', { max: MAX_SEARCH_LENGTH })}
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="relative">
              <span className="sr-only">{t('admin.events.category_filter')}</span>
              <select
                value={category}
                onChange={(event) => setSearchParams((current) => withParams(current, { category: event.target.value, page: 1 }))}
                className={adminSelect}
              >
                <option value="">{t('admin.events.all_categories')}</option>
                {(filterOptions.data?.categories ?? CATEGORIES).map((key) => (
                  <option key={key} value={key}>{eventCategoryLabel(key)}</option>
                ))}
              </select>
              <Chevron />
            </label>
            <label className="relative">
              <span className="sr-only">{t('admin.events.outcome_filter')}</span>
              <select
                value={outcome}
                onChange={(event) => setSearchParams((current) => withParams(current, { outcome: event.target.value, page: 1 }))}
                className={adminSelect}
              >
                <option value="">{t('admin.events.all_results')}</option>
                <option value="success">{t('admin.events.success')}</option>
                <option value="failure">{t('admin.events.failure')}</option>
              </select>
              <Chevron />
            </label>
            <label className="relative">
              <span className="sr-only">{t('admin.events.sort_filter')}</span>
              <select
                value={sort}
                onChange={(event) => setSearchParams((current) => withParams(current, { sort: event.target.value, page: 1 }))}
                className={adminSelect}
              >
                <option value="occurred_desc">{t('admin.events.sort_desc')}</option>
                <option value="occurred_asc">{t('admin.events.sort_asc')}</option>
              </select>
              <Chevron />
            </label>
          </div>

          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <p className="mb-2 text-sm font-medium text-text-secondary">{t('admin.events.period')}</p>
            <div className="flex flex-wrap items-end gap-3">
              <DateFilterField
                id="events-date-from"
                label={t('admin.events.date_from')}
                value={dateFrom}
                className="w-full sm:w-[230px]"
                resetToken={dateResetToken}
                onDraftChange={reportDraftFrom}
                onChange={(next) => setSearchParams((current) => withParams(current, { date_from: next, page: 1 }))}
              />
              <DateFilterField
                id="events-date-to"
                label={t('admin.events.date_to')}
                value={dateTo}
                className="w-full sm:w-[230px]"
                resetToken={dateResetToken}
                onDraftChange={reportDraftTo}
                onChange={(next) => setSearchParams((current) => withParams(current, { date_to: next, page: 1 }))}
              />
              <button
                type="button"
                onClick={resetDates}
                disabled={!dateFrom && !dateTo && !hasDateDraft}
                className="h-9 shrink-0 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('admin.events.reset')}
              </button>
            </div>
          </div>
          {invalidRange && (
            <p role="alert" className="text-sm text-danger">{t('admin.errors.validation')}</p>
          )}
        </div>

        <div className="mt-5">
          {events.isError ? (
            <AdminError message={adminErrorText(events.error)} onRetry={() => void events.refetch()} compact />
          ) : events.isLoading ? (
            <AdminTableSkeleton
              headUppercase
              minWidthClass="min-w-[900px]"
              columns={[
                { widthClass: 'w-[12%]', contentClass: 'h-4 w-16' },
                { widthClass: 'w-[20%]', contentClass: 'h-4 w-32' },
                { widthClass: 'w-[15%]', contentClass: 'h-4 w-10' },
                { contentClass: 'h-4 w-2/3' },
                { widthClass: 'w-[12%]', contentClass: 'h-4 w-16' },
              ]}
            />
          ) : total === 0 ? (
            <AdminEmpty
              title={t('admin.events.empty_title')}
              description={urlQuery || category || outcome || dateFrom || dateTo ? t('admin.events.empty_desc') : t('admin.common.empty_desc')}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead>
                    <tr className={`${adminTableHead} uppercase tracking-wide`}>
                      <th scope="col" className={`${adminTableHeadCell} w-[12%]`}>{t('admin.events.col_time')}</th>
                      <th scope="col" className={`${adminTableHeadCell} w-[20%]`}>{t('admin.events.col_username')}</th>
                      <th scope="col" className={`${adminTableHeadCell} w-[15%]`}>{t('admin.events.col_user_id')}</th>
                      <th scope="col" className={adminTableHeadCell}>{t('admin.events.col_event')}</th>
                      <th scope="col" className={`${adminTableHeadCell} w-[12%]`}>{t('admin.events.col_outcome')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.data?.items.map((event) => {
                      const details = eventDetailsLine(event)
                      const actorId = eventActorId(event)
                      const actorRole = eventActorRole(event)
                      return (
                        <tr key={event.id} className="border-b border-border last:border-0">
                          <td className={`${adminTableCell} whitespace-nowrap text-sm text-text-secondary`}>
                            {formatEventTime(event.occurred_at)}
                          </td>
                          <td className={`${adminTableCell} text-sm text-text-primary`}>
                            <span className="break-words">{eventActorName(event)}</span>
                            {actorRole && (
                              <span className="whitespace-nowrap text-xs text-text-muted">
                                {' · '}
                                {actorRole}
                              </span>
                            )}
                          </td>
                          <td className={`${adminTableCell} text-sm tabular-nums ${actorId === null ? 'text-text-muted' : 'text-text-secondary'}`}>
                            {actorId === null ? <span aria-hidden="true">—</span> : actorId}
                          </td>
                          <td className={adminTableCell}>
                            <p className="text-sm text-text-primary">{eventTypeLabel(event)}</p>
                            {details && <p className="mt-0.5 text-xs text-text-muted">{details}</p>}
                          </td>
                          <td className={adminTableCell}>
                            <span className={`inline-flex items-center gap-1.5 text-sm ${event.outcome === 'failure' ? 'text-danger' : 'text-success'}`}>
                              {event.outcome === 'failure'
                                ? <FiAlertCircle className="h-4 w-4" aria-hidden="true" />
                                : <FiCheckCircle className="h-4 w-4" aria-hidden="true" />}
                              {eventOutcomeLabel(event.outcome)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <AdminPagination
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  totalPages={totalPages}
                  onPageChange={(next) => {
                    if (next < 1 || next > totalPages) return
                    setSearchParams((current) => withParams(current, { page: next }))
                  }}
                  onPageSizeChange={(size) => setSearchParams((current) => withParams(current, { page_size: size, page: 1 }))}
                />
              </div>
            </>
          )}
        </div>
      </section>
    </AdminLayout>
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
