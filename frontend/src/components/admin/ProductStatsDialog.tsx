import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiMessageSquare, FiTrendingUp } from 'react-icons/fi'
import { useGetProductStatsDetailApiV1AdminStatsProductsProductIdGet } from '../../api/generated/client'
import { formatMoney, formatNumber, formatRating, monthLabel, periodRangeLabel, spansMultipleYears } from '../../admin/params'
import { AdminDialog, AdminDialogClose } from './AdminDialog'
import { useDialogTitleId } from './useDialogTitleId'
import { AdminError, AdminLoading } from './AdminFeedback'
import { LineChart } from './LineChart'
import { StarsDisplay } from './Stars'
import { adminCard, adminPrimaryButton, adminSelect } from './adminStyles'

interface ProductStatsDialogProps {
  productId: number | null
  dateFrom?: string
  dateTo?: string
  onClose: () => void
}

type Metric = 'units' | 'amount'

export function ProductStatsDialog({ productId, dateFrom, dateTo, onClose }: ProductStatsDialogProps) {
  const { t } = useTranslation()
  const [metric, setMetric] = useState<Metric>('units')
  const titleId = useDialogTitleId('product-stats-dialog')
  const detail = useGetProductStatsDetailApiV1AdminStatsProductsProductIdGet(
    productId ?? 0,
    { date_from: dateFrom, date_to: dateTo },
    { query: { enabled: productId !== null, retry: false } },
  )

  const data = detail.data
  const distribution = data?.rating_distribution ?? []
  const maxBucket = Math.max(0, ...distribution.map((bucket) => bucket.count))
  const monthly = data?.monthly ?? []
  const monthlyWithYear = spansMultipleYears(monthly.map((point) => point.month))
  const series = [{
    name: metric === 'amount' ? t('admin.analytics.detail_metric_revenue') : t('admin.analytics.detail_metric_units'),
    color: '#2563eb',
    points: monthly.map((point) => ({
      label: monthLabel(point.month, { withYear: monthlyWithYear }),
      value: metric === 'amount' ? Number(point.amount) : point.units_count,
    })),
  }]

  return (
    <AdminDialog
      open={productId !== null}
      onClose={onClose}
      labelledBy={titleId}
      widthClass="max-w-[900px]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
            <FiTrendingUp className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-xl font-bold text-text-primary sm:text-2xl">
              {data?.product.name ?? t('admin.analytics.detail_modal_title')}
            </h2>
            <p className="mt-0.5 truncate text-sm text-text-secondary">
              {t('admin.analytics.detail_modal_title')}
              {data?.product.category ? ` · ${data.product.category}` : ''}
            </p>
          </div>
        </div>
        <AdminDialogClose onClick={onClose} />
      </div>

      <div className="mt-5 border-t border-border pt-5">
        {detail.isError ? (
          <AdminError message={t('admin.analytics.detail_load_error')} onRetry={() => void detail.refetch()} />
        ) : detail.isLoading || !data ? (
          <AdminLoading />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className={`${adminCard} p-4`}>
                <p className="text-xs text-text-secondary">{t('admin.analytics.detail_sold')}</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">{formatNumber(data.product.sold_units ?? 0)}</p>
              </div>
              <div className={`${adminCard} p-4`}>
                <p className="text-xs text-text-secondary">{t('admin.analytics.detail_revenue')}</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">{formatMoney(data.product.revenue ?? 0)}</p>
              </div>
              <div className={`${adminCard} p-4`}>
                <p className="text-xs text-text-secondary">{t('admin.analytics.detail_rating')}</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-2xl font-semibold text-text-primary">
                    {(data.product.review_count ?? 0) > 0 ? formatRating(data.product.average_rating ?? 0) : '—'}
                  </p>
                  {(data.product.review_count ?? 0) > 0 && <StarsDisplay value={data.product.average_rating ?? 0} />}
                </div>
              </div>
            </div>

            <section className="mt-4 rounded-xl border border-border p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-text-primary">{t('admin.analytics.detail_dynamics')}</h3>
                  <p className="mt-0.5 text-xs text-text-secondary">{periodRangeLabel(data.date_from, data.date_to)}</p>
                </div>
                <label className="relative">
                  <span className="sr-only">{t('admin.analytics.detail_dynamics')}</span>
                  <select
                    value={metric}
                    onChange={(event) => setMetric(event.target.value as Metric)}
                    className={`${adminSelect} h-10 w-auto min-w-[180px]`}
                  >
                    <option value="units">{t('admin.analytics.detail_metric_units')}</option>
                    <option value="amount">{t('admin.analytics.detail_metric_revenue')}</option>
                  </select>
                  <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </label>
              </div>
              <div className="mt-4">
                <LineChart
                  series={series}
                  height={240}
                  formatValue={(value) => metric === 'amount' ? formatMoney(value) : formatNumber(value)}
                  ariaLabel={`${t('admin.analytics.detail_dynamics')} — ${data.product.name}`}
                />
              </div>
            </section>

            <section className="mt-4 rounded-xl border border-border p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-text-primary">{t('admin.analytics.detail_reviews')}</h3>
                  <p className="mt-0.5 text-xs text-text-secondary">{t('admin.analytics.detail_reviews_hint')}</p>
                </div>
                <span className="inline-flex items-center gap-2 text-sm text-primary">
                  <FiMessageSquare className="h-4 w-4" aria-hidden="true" />
                  {t('admin.analytics.detail_reviews_count', { count: data.product.review_count ?? 0 })}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {[5, 4, 3, 2, 1].map((rating) => {
                  const bucket = distribution.find((item) => item.rating === rating)
                  const count = bucket?.count ?? 0
                  const width = maxBucket > 0 ? Math.max(count > 0 ? 2 : 0, (count / maxBucket) * 100) : 0
                  return (
                    <div key={rating} className="grid grid-cols-[2rem_1fr_2.5rem] items-center gap-3">
                      <span className="flex items-center gap-1 text-xs text-text-secondary">
                        {rating} <span className="text-amber-400" aria-hidden="true">★</span>
                      </span>
                      <div className="h-4 overflow-hidden rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-amber-400" style={{ width: `${width}%` }} />
                      </div>
                      <span className="text-right text-xs text-text-secondary">{count}</span>
                    </div>
                  )
                })}
              </div>
            </section>

            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} className={adminPrimaryButton}>
                {t('admin.analytics.detail_close')}
              </button>
            </div>
          </>
        )}
      </div>
    </AdminDialog>
  )
}
