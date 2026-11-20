import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FiCreditCard, FiPackage, FiShoppingBag, FiStar, FiTrendingUp } from 'react-icons/fi'
import {
  useGetComparisonTimelineApiV1AdminStatsTimelineGet,
  useGetOverviewApiV1AdminStatsOverviewGet,
  useGetProductStatsApiV1AdminStatsProductsGet,
} from '../../api/generated/client'
import { adminErrorText, daysAgo, formatCompactNumber, formatDecimal, formatMoney, formatNumber, formatRating, isoDate, MAX_SEARCH_LENGTH, monthLabel, monthsAgoStart, niceAxisMax, periodRangeLabel, spansMultipleYears } from '../../admin/params'
import { useDebouncedValue } from '../../utils/useDebouncedValue'
import { AdminError, AdminLoading } from '../../components/admin/AdminFeedback'
import { LineChart } from '../../components/admin/LineChart'
import { BarList } from '../../components/admin/BarList'
import { StarsDisplay } from '../../components/admin/Stars'
import { adminCard, adminControl, adminSelect } from '../../components/admin/adminStyles'

type Period = '30d' | '3m' | '6m' | '12m' | 'all'
type Metric = 'units' | 'amount'
type Mode = 'all' | 'compare'

const SERIES_COLORS = ['#2563eb', '#8b5cf6', '#f97316', '#16a34a', '#ef4444']

function rangeFor(period: Period): { date_from?: string; date_to?: string } {
  if (period === 'all') return {}
  if (period === '30d') return { date_from: daysAgo(30), date_to: isoDate(new Date()) }
  const months = period === '3m' ? 3 : period === '6m' ? 6 : 12
  return { date_from: monthsAgoStart(months), date_to: isoDate(new Date()) }
}

export function AnalyticsOverview() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<Period>('6m')
  const [metric, setMetric] = useState<Metric>('units')
  const [mode, setMode] = useState<Mode>('all')
  const [compareIds, setCompareIds] = useState<number[]>([])
  const [compareNames, setCompareNames] = useState<Record<number, string>>({})
  const [compareSearch, setCompareSearch] = useState('')
  const compareQuery = useDebouncedValue(compareSearch, 300)
  const range = useMemo(() => rangeFor(period), [period])

  const overview = useGetOverviewApiV1AdminStatsOverviewGet({
    date_from: range.date_from,
    date_to: range.date_to,
  })
  const compareProducts = useGetProductStatsApiV1AdminStatsProductsGet(
    {
      page: 1, page_size: 30, q: compareQuery || undefined, sort: 'sold_units_desc',
      date_from: range.date_from, date_to: range.date_to,
    },
    { query: { enabled: mode === 'compare', retry: false } },
  )
  const timeline = useGetComparisonTimelineApiV1AdminStatsTimelineGet(
    {
      product_ids: compareIds,
      date_from: range.date_from,
      date_to: range.date_to,
    },
    { query: { enabled: mode === 'compare' && compareIds.length > 0, retry: false } },
  )

  const toggleProduct = (id: number, name?: string) => {
    if (compareIds.includes(id)) {
      setCompareIds(compareIds.filter((value) => value !== id))
      setCompareNames((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
      return
    }
    if (compareIds.length >= 5) return
    // Keep the label captured at selection time: the product may drop out of the
    // current search results later, but the chip must keep a recognisable name.
    if (name) setCompareNames((current) => (current[id] === name ? current : { ...current, [id]: name }))
    setCompareIds((current) => [...current, id])
  }

  const moneyAxis = metric === 'amount'
  const formatAxis = (value: number) => moneyAxis ? `${formatCompactNumber(value)} ₽` : formatNumber(value)
  // The axis stays compact, but a tooltip must show the exact amount the point stands for.
  const formatTooltipValue = (value: number) => moneyAxis ? formatMoney(value) : formatNumber(value)

  if (overview.isError) {
    return <AdminError message={adminErrorText(overview.error)} onRetry={() => void overview.refetch()} />
  }
  if (overview.isLoading || !overview.data) {
    return <AdminLoading />
  }

  const data = overview.data
  const monthly = data.monthly ?? []
  const allMonthsWithYear = spansMultipleYears(monthly.map((point) => point.month))
  const allSeries = [{
    name: t('admin.analytics.mode_all'),
    color: SERIES_COLORS[0],
    points: monthly.map((point) => ({
      label: monthLabel(point.month, { withYear: allMonthsWithYear }),
      value: metric === 'amount' ? Number(point.amount) : point.units_count,
    })),
  }]
  const timelineSeries = timeline.data?.series ?? []
  const compareMonths = timelineSeries.flatMap((series) => (series.monthly ?? []).map((point) => point.month))
  const compareMonthsWithYear = spansMultipleYears(compareMonths)
  const compareSeries = timelineSeries.map((series, index) => ({
    name: series.name,
    color: SERIES_COLORS[index % SERIES_COLORS.length],
    points: (series.monthly ?? []).map((point) => ({
      label: monthLabel(point.month, { withYear: compareMonthsWithYear }),
      value: metric === 'amount' ? Number(point.amount) : point.units_count,
    })),
  }))
  const chartSeries = mode === 'all' ? allSeries : compareSeries
  const topSalesMax = niceAxisMax(Math.max(0, ...(data.top_products_by_sales ?? []).map((item) => item.units)))
  const periodLabel = periodRangeLabel(data.date_from, data.date_to)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-text-primary">{t('admin.analytics.overview_title')}</h2>
        <label className="relative">
          <span className="sr-only">{t('admin.analytics.period')}</span>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as Period)}
            className={`${adminSelect} w-auto min-w-[210px] pl-10`}
          >
            <option value="30d">{t('admin.analytics.period_30d')}</option>
            <option value="3m">{t('admin.analytics.period_3m')}</option>
            <option value="6m">{t('admin.analytics.period_6m')}</option>
            <option value="12m">{t('admin.analytics.period_12m')}</option>
            <option value="all">{t('admin.analytics.period_all')}</option>
          </select>
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" />
          </svg>
          <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Kpi
          icon={<FiShoppingBag className="h-5 w-5" />}
          label={t('admin.analytics.kpi_orders')}
          value={formatNumber(data.completed_orders)}
          hint={t('admin.analytics.kpi_orders_hint')}
        />
        <Kpi
          icon={<FiPackage className="h-5 w-5" />}
          label={t('admin.analytics.kpi_units')}
          value={formatNumber(data.sold_units)}
          hint={t('admin.analytics.kpi_units_hint')}
        />
        <Kpi
          icon={<FiCreditCard className="h-5 w-5" />}
          label={t('admin.analytics.kpi_revenue')}
          value={formatMoney(data.revenue)}
          hint={t('admin.analytics.kpi_revenue_hint')}
        />
        <Kpi
          icon={<FiStar className="h-5 w-5" />}
          label={t('admin.analytics.kpi_rating')}
          value={data.review_count > 0 ? formatRating(data.average_rating) : '—'}
          hint={t('admin.analytics.kpi_rating_hint')}
          extra={data.review_count > 0 ? <StarsDisplay value={data.average_rating} /> : undefined}
        />
      </div>

      <section className={`${adminCard} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">{t('admin.analytics.dynamics')}</h3>
            <p className="mt-0.5 text-sm text-text-secondary">{t('admin.analytics.dynamics_hint')}</p>
          </div>
          <label className="relative">
            <span className="sr-only">{t('admin.analytics.dynamics')}</span>
            <select
              value={metric}
              onChange={(event) => setMetric(event.target.value as Metric)}
              className={`${adminSelect} w-auto min-w-[190px]`}
            >
              <option value="units">{t('admin.analytics.metric_units')}</option>
              <option value="amount">{t('admin.analytics.metric_revenue')}</option>
            </select>
            <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('all')}
            aria-pressed={mode === 'all'}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${mode === 'all' ? 'bg-surface-3 font-medium text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            {t('admin.analytics.mode_all')}
          </button>
          <button
            type="button"
            onClick={() => setMode('compare')}
            aria-pressed={mode === 'compare'}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${mode === 'compare' ? 'bg-surface-3 font-medium text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            {t('admin.analytics.mode_compare')}
          </button>
        </div>

        {mode === 'compare' && (
          <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
            <p className="text-xs font-medium text-text-secondary">{t('admin.analytics.compare_hint')}</p>
            <input
              type="search"
              value={compareSearch}
              maxLength={MAX_SEARCH_LENGTH}
              onChange={(event) => setCompareSearch(event.target.value)}
              placeholder={t('admin.analytics.compare_search')}
              aria-label={t('admin.analytics.compare_search')}
              className={`${adminControl} mt-2 h-10`}
            />
            <div className="mt-2 max-h-44 overflow-y-auto">
              {compareProducts.isLoading ? (
                <p role="status" className="px-1 py-2 text-xs text-text-muted">{t('admin.common.loading')}</p>
              ) : compareProducts.isError ? (
                <p role="alert" className="px-1 py-2 text-xs text-danger">{adminErrorText(compareProducts.error)}</p>
              ) : (compareProducts.data?.items.length ?? 0) === 0 ? (
                <p className="px-1 py-2 text-xs text-text-muted">{t('admin.analytics.empty_desc')}</p>
              ) : (
                <ul className="space-y-1">
                  {compareProducts.data?.items.map((product) => {
                    const checked = compareIds.includes(product.id)
                    const disabled = !checked && compareIds.length >= 5
                    return (
                      <li key={product.id}>
                        <label className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-surface-3'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleProduct(product.id, product.name)}
                            className="h-4 w-4 accent-[var(--color-primary)]"
                          />
                          <span className="min-w-0 flex-1 truncate text-text-primary">{product.name}</span>
                          <span className="shrink-0 text-xs text-text-muted">{product.sku}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            {compareIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
                {compareIds.map((id, index) => {
                  const product = compareProducts.data?.items.find((item) => item.id === id)
                  const label = product?.name ?? compareNames[id] ?? `#${id}`
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleProduct(id)}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-primary"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} aria-hidden="true" />
                      {label}
                      <span aria-hidden="true">×</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          {mode === 'compare' && compareIds.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-muted">{t('admin.analytics.compare_empty')}</p>
          ) : mode === 'compare' && timeline.isError ? (
            <AdminError message={adminErrorText(timeline.error)} onRetry={() => void timeline.refetch()} compact />
          ) : mode === 'compare' && timeline.isLoading ? (
            <AdminLoading />
          ) : (
            <LineChart
              series={chartSeries}
              height={280}
              formatValue={formatAxis}
              formatTooltipValue={formatTooltipValue}
              ariaLabel={`${t('admin.analytics.dynamics')}: ${mode === 'all' ? t('admin.analytics.mode_all') : t('admin.analytics.mode_compare')}`}
            />
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-text-muted">
          <span>{t('admin.analytics.grouped')}</span>
          <span>{t('admin.analytics.period_line', { period: periodLabel })}</span>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${adminCard} p-5 sm:p-6`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-text-primary">{t('admin.analytics.top_sales')}</h3>
              <p className="mt-0.5 text-sm text-text-secondary">{t('admin.analytics.top_sales_hint')}</p>
            </div>
            <FiTrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-5">
            <BarList
              items={(data.top_products_by_sales ?? []).map((item) => ({
                key: item.product_id ?? item.name,
                label: item.name,
                value: item.units,
              }))}
              max={topSalesMax}
              formatValue={formatNumber}
              axisLabels={[
                t('admin.analytics.axis_units', { value: formatNumber(0) }),
                t('admin.analytics.axis_units', { value: formatNumber(Math.round(topSalesMax / 2)) }),
                t('admin.analytics.axis_units', { value: formatNumber(topSalesMax) }),
              ]}
              legend={t('admin.analytics.top_sales_legend')}
              ariaLabel={t('admin.analytics.top_sales')}
            />
          </div>
        </section>

        <section className={`${adminCard} p-5 sm:p-6`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-text-primary">{t('admin.analytics.top_reviews')}</h3>
              <p className="mt-0.5 text-sm text-text-secondary">{t('admin.analytics.top_reviews_hint')}</p>
            </div>
            <FiStar className="h-5 w-5 text-amber-400" aria-hidden="true" />
          </div>
          <div className="mt-5">
            <BarList
              items={(data.top_products_by_reviews ?? []).map((item) => ({
                key: item.product_id,
                label: item.name,
                value: item.average_rating,
              }))}
              max={5}
              axisLabels={[
                t('admin.analytics.axis_rating', { value: formatDecimal(0) }),
                t('admin.analytics.axis_rating', { value: formatDecimal(2.5) }),
                t('admin.analytics.axis_rating', { value: formatDecimal(5) }),
              ]}
              legend={t('admin.analytics.top_reviews_legend')}
              formatValue={formatRating}
              ariaLabel={t('admin.analytics.top_reviews')}
            />
          </div>
          <p className="mt-3 text-xs text-text-muted">{t('admin.analytics.reviews_footnote')}</p>
        </section>
      </div>

    </div>
  )
}

function Kpi({
  icon, label, value, hint, extra,
}: {
  icon: ReactNode
  label: string
  value: string
  hint: string
  extra?: ReactNode
}) {
  return (
    <div className={`${adminCard} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-text-secondary">{label}</p>
        <span className="text-primary" aria-hidden="true">{icon}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <p className="text-3xl font-semibold tracking-tight text-text-primary">{value}</p>
        {extra}
      </div>
      <p className="mt-2 text-xs text-text-muted">{hint}</p>
    </div>
  )
}
