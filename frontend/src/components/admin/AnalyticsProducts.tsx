import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiSearch, FiStar } from 'react-icons/fi'
import {
  useGetProductOptionsApiV1AdminProductOptionsGet,
  useGetProductStatsApiV1AdminStatsProductsGet,
} from '../../api/generated/client'
import {
  adminErrorText, formatMoney, formatNumber, formatRating, isoDate, monthsAgoStart, type AdminProductStatsSort,
} from '../../admin/params'
import { useDebouncedValue } from '../../utils/useDebouncedValue'
import { AdminEmpty, AdminError } from '../../components/admin/AdminFeedback'
import { AdminInlineValueSkeleton, AdminTableSkeleton } from '../../components/skeletons/AdminSkeletons'
import { AdminPagination } from '../../components/admin/AdminPagination'
import { ProductStatsDialog } from './ProductStatsDialog'
import {
  adminControl, adminSecondaryButton, adminSelect, adminTableHead, adminTableHeadCell, adminTableCell,
} from './adminStyles'

type Period = 'all' | '6m' | '12m'
type SortValue = Extract<
  AdminProductStatsSort,
  'sold_units_desc' | 'revenue_desc' | 'rating_desc' | 'review_count_desc' | 'name_asc'
>

function rangeFor(period: Period): { date_from?: string; date_to?: string } {
  if (period === 'all') return {}
  const months = period === '6m' ? 6 : 12
  return { date_from: monthsAgoStart(months), date_to: isoDate(new Date()) }
}

export function AnalyticsProducts() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<Period>('all')
  const [search, setSearch] = useState('')
  const query = useDebouncedValue(search, 300)
  const [category, setCategory] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [rating, setRating] = useState('')
  const [sort, setSort] = useState<SortValue>('sold_units_desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<number | null>(null)
  const range = useMemo(() => rangeFor(period), [period])

  const options = useGetProductOptionsApiV1AdminProductOptionsGet()
  const stats = useGetProductStatsApiV1AdminStatsProductsGet({
    page,
    page_size: pageSize,
    q: query || undefined,
    category: category || undefined,
    manufacturer: manufacturer || undefined,
    min_rating: rating ? Number(rating) : undefined,
    date_from: range.date_from,
    date_to: range.date_to,
    sort,
  })

  const total = stats.data?.total ?? 0
  const totalPages = stats.data?.total_pages ?? 1

  const reset = () => {
    setSearch('')
    setCategory('')
    setManufacturer('')
    setRating('')
    setSort('sold_units_desc')
    setPage(1)
  }

  const hasFilters = Boolean(search || category || manufacturer || rating) || sort !== 'sold_units_desc'

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">{t('admin.analytics.products_title')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('admin.analytics.products_hint')}</p>
        </div>
        <label className="relative">
          <span className="sr-only">{t('admin.analytics.period')}</span>
          <select
            value={period}
            onChange={(event) => { setPeriod(event.target.value as Period); setPage(1) }}
            className={`${adminSelect} w-auto min-w-[190px] pl-10`}
          >
            <option value="all">{t('admin.analytics.period_all')}</option>
            <option value="6m">{t('admin.analytics.period_6m')}</option>
            <option value="12m">{t('admin.analytics.period_12m')}</option>
          </select>
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" />
          </svg>
          <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </label>
      </div>

      <div className="relative mt-4">
        <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1) }}
          placeholder={t('admin.analytics.products_search')}
          aria-label={t('admin.analytics.products_search')}
          className={`${adminControl} pl-10`}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1.5 block text-sm text-text-secondary">{t('admin.analytics.category_filter')}</span>
          <span className="relative block">
          <select
            value={category}
            onChange={(event) => { setCategory(event.target.value); setPage(1) }}
            className={adminSelect}
          >
            <option value="">{t('admin.analytics.all_categories')}</option>
            {(options.data?.categories ?? []).map(({ category: item }) => (
              <option key={item.id} value={item.slug}>{item.name}</option>
            ))}
          </select>
          <Chevron />
          </span>
        </label>
        <label>
          <span className="mb-1.5 block text-sm text-text-secondary">{t('admin.analytics.manufacturer_filter')}</span>
          <span className="relative block">
          <select
            value={manufacturer}
            onChange={(event) => { setManufacturer(event.target.value); setPage(1) }}
            className={adminSelect}
          >
            <option value="">{t('admin.analytics.all_manufacturers')}</option>
            {(options.data?.manufacturers ?? []).map((item) => (
              <option key={item.id} value={item.slug}>{item.name}</option>
            ))}
          </select>
          <Chevron />
          </span>
        </label>
        <label>
          <span className="mb-1.5 block text-sm text-text-secondary">{t('admin.analytics.rating_filter')}</span>
          <span className="relative block">
          <select
            value={rating}
            onChange={(event) => { setRating(event.target.value); setPage(1) }}
            className={adminSelect}
          >
            <option value="">{t('admin.analytics.rating_all')}</option>
            <option value="3">{t('admin.analytics.rating_30')}</option>
            <option value="4">{t('admin.analytics.rating_40')}</option>
            <option value="4.5">{t('admin.analytics.rating_45')}</option>
          </select>
          <Chevron />
          </span>
        </label>
        <label>
          <span className="mb-1.5 block text-sm text-text-secondary">{t('admin.analytics.sort_filter')}</span>
          <span className="relative block">
          <select
            value={sort}
            onChange={(event) => { setSort(event.target.value as SortValue); setPage(1) }}
            className={adminSelect}
          >
            <option value="sold_units_desc">{t('admin.analytics.sort_sold_desc')}</option>
            <option value="revenue_desc">{t('admin.analytics.sort_revenue_desc')}</option>
            <option value="rating_desc">{t('admin.analytics.sort_rating_desc')}</option>
            <option value="review_count_desc">{t('admin.analytics.sort_review_desc')}</option>
            <option value="name_asc">{t('admin.analytics.sort_name_asc')}</option>
          </select>
          <Chevron />
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm text-text-secondary">
          <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
          </svg>
          {stats.isLoading ? <AdminInlineValueSkeleton className="h-4 w-28" /> : t('admin.analytics.found', { count: total })}
        </span>
        <button
          type="button"
          onClick={reset}
          disabled={!hasFilters}
          className={`${adminSecondaryButton} h-9 rounded-full px-4 text-sm disabled:opacity-50`}
        >
          {t('admin.analytics.reset')}
        </button>
      </div>

      <div className="mt-3">
        {stats.isError ? (
          <AdminError message={adminErrorText(stats.error)} onRetry={() => void stats.refetch()} compact />
        ) : stats.isLoading ? (
          <AdminTableSkeleton
            columns={[
              { widthClass: 'w-[34%]', contentClass: 'h-4 w-2/3' },
              { widthClass: 'w-[14%]', contentClass: 'h-4 w-12' },
              { widthClass: 'w-[17%]', contentClass: 'h-4 w-20' },
              { widthClass: 'w-[16%]', contentClass: 'h-4 w-14' },
              { contentClass: 'h-4 w-12' },
            ]}
            rows={6}
          />
        ) : total === 0 ? (
          <AdminEmpty title={t('admin.analytics.empty_title')} description={t('admin.analytics.empty_desc')} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className={adminTableHead}>
                    <th scope="col" className={`${adminTableHeadCell} w-[34%]`}>{t('admin.analytics.col_product')}</th>
                    <th scope="col" className={`${adminTableHeadCell} w-[14%]`}>{t('admin.analytics.col_sold')}</th>
                    <th scope="col" className={`${adminTableHeadCell} w-[17%]`}>{t('admin.analytics.col_revenue')}</th>
                    <th scope="col" className={`${adminTableHeadCell} w-[16%]`}>{t('admin.analytics.col_rating')}</th>
                    <th scope="col" className={adminTableHeadCell}>{t('admin.analytics.col_reviews')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.data?.items.map((product) => (
                    <tr key={product.id} className="border-b border-border last:border-0">
                      <td className={adminTableCell}>
                        <button
                          type="button"
                          onClick={() => setSelected(product.id)}
                          className="text-left text-sm font-semibold text-primary hover:underline"
                          aria-label={t('admin.analytics.open_product', { name: product.name })}
                        >
                          {product.name}
                        </button>
                        <p className="mt-0.5 text-xs text-text-muted">{product.sku ?? t('admin.products.no_sku')}</p>
                      </td>
                      <td className={`${adminTableCell} text-sm text-text-primary`}>{formatNumber(product.sold_units ?? 0)}</td>
                      <td className={`${adminTableCell} whitespace-nowrap text-sm text-text-primary`}>{formatMoney(product.revenue ?? 0)}</td>
                      <td className={adminTableCell}>
                        <span className="inline-flex items-center gap-1.5 text-sm text-text-primary">
                          <FiStar className="h-4 w-4 text-amber-400" aria-hidden="true" />
                          {(product.review_count ?? 0) > 0 ? formatRating(product.average_rating ?? 0) : '—'}
                        </span>
                      </td>
                      <td className={`${adminTableCell} text-sm text-text-primary`}>{formatNumber(product.review_count ?? 0)}</td>
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

      <ProductStatsDialog
        productId={selected}
        dateFrom={range.date_from}
        dateTo={range.date_to}
        onClose={() => setSelected(null)}
      />
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
