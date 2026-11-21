import { Skeleton, SkeletonText } from '../ui/skeleton'
import { SkeletonRegion } from './SkeletonRegion'
import { adminCard, adminTableHead, adminTableHeadCell, adminTableCell } from '../admin/adminStyles'
import { useElementWidth } from '../../admin/useElementWidth'
import { CHART_BASE_WIDTH, lineChartHeight } from '../admin/chartGeometry'

/** Reference width of the analytics charts; the placeholder measures its own box. */
const CHART_REFERENCE_WIDTH = CHART_BASE_WIDTH

/**
 * Administration skeletons.
 *
 * They reuse the shared class recipes of the admin screens (`adminCard`,
 * `adminTableHead`, `adminTableCell`), so a placeholder row is as tall and as
 * wide as the real row it turns into.
 */

export interface SkeletonColumn {
  /** Column width, e.g. `w-[42%]`, applied to both the head and body cells. */
  widthClass?: string
  /** Shape of the placeholder inside the body cell, e.g. `h-10 w-40`. */
  contentClass?: string
}

interface AdminTableSkeletonProps {
  columns: SkeletonColumn[]
  rows?: number
  /** The real tables scroll horizontally below this minimum width. */
  minWidthClass?: string
  headUppercase?: boolean
  testId?: string
}

/** A table placeholder with the head, dividers and paddings of the real tables. */
export function AdminTableSkeleton({
  columns,
  rows = 8,
  minWidthClass = 'min-w-[640px]',
  headUppercase = false,
  testId = 'admin-table-skeleton',
}: AdminTableSkeletonProps) {
  return (
    <SkeletonRegion testId={testId}>
      <div className="overflow-x-auto">
        <table className={`w-full ${minWidthClass} border-collapse`}>
          <thead>
            <tr className={`${adminTableHead} ${headUppercase ? 'uppercase tracking-wide' : ''}`.trim()}>
              {columns.map((column, index) => (
                <th key={index} scope="col" className={`${adminTableHeadCell} ${column.widthClass ?? ''}`.trim()}>
                  <Skeleton className="h-4 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, row) => (
              <tr key={row} className="border-b border-border last:border-0">
                {columns.map((column, index) => (
                  <td key={index} className={adminTableCell}>
                    <Skeleton className={column.contentClass ?? 'h-4 w-full'} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-col gap-4 border-t border-border pt-5 lg:flex-row lg:items-center lg:justify-between">
        <Skeleton className="h-9 w-40 rounded-lg" />
        <div className="flex items-center justify-center gap-1.5">
          {[0, 1, 2, 3].map((page) => <Skeleton key={page} className="h-9 w-9 rounded-lg" />)}
        </div>
        <Skeleton className="h-5 w-40" />
      </div>
    </SkeletonRegion>
  )
}

/**
 * A counter value inside a running text line ("Всего: …").
 * Kept inline so the surrounding sentence keeps its layout.
 */
export function AdminInlineValueSkeleton({ className = 'h-4 w-10' }: { className?: string }) {
  return <SkeletonText className={`align-middle ${className}`} />
}

/** `/admin/*` — the whole administration panel while the session is verified. */
export function AdminPageSkeleton() {
  return (
    <SkeletonRegion testId="admin-page-skeleton">
      <section className={`${adminCard} px-5 py-6 sm:px-8 sm:py-8`}>
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        <div className="mt-6 border-t border-border pt-1">
          <div className="flex gap-6 py-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <Skeleton className="h-11 w-40 rounded-lg" />
          <Skeleton className="h-11 w-40 rounded-lg" />
        </div>
        <div className="mt-6 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="mt-4 space-y-3">
          <Skeleton className="h-11 w-full rounded-lg" />
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        </div>
        <div className="mt-5">
          <AdminTableSkeleton
            columns={[
              { widthClass: 'w-[42%]' },
              { widthClass: 'w-[18%]', contentClass: 'h-4 w-20' },
              { widthClass: 'w-[16%]', contentClass: 'h-4 w-16' },
              { contentClass: 'h-10 w-56' },
            ]}
            rows={6}
          />
        </div>
      </section>
    </SkeletonRegion>
  )
}

/** Analytics — a line-chart placeholder with axis ticks, plot and legend. */
export function ChartSkeleton({ height = 280 }: { height?: number }) {
  const [containerRef, containerWidth] = useElementWidth(CHART_REFERENCE_WIDTH)
  // The real chart grows with its container, so the placeholder measures the same
  // box and keeps the card height identical before and after the data arrives.
  const totalHeight = lineChartHeight(height, containerWidth)
  return (
    <SkeletonRegion testId="chart-skeleton">
      <div ref={containerRef} className="flex flex-col" style={{ height: totalHeight }}>
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex w-12 shrink-0 flex-col justify-between py-1">
            {[0, 1, 2, 3, 4].map((index) => <Skeleton key={index} className="h-2.5 w-9" />)}
          </div>
          <Skeleton className="min-w-0 flex-1 rounded-lg" />
        </div>
        <div className="mt-1 flex items-center justify-center gap-5">
          <Skeleton className="h-2.5 w-2.5 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </SkeletonRegion>
  )
}

/** Analytics — a horizontal ranking chart placeholder (28px bars, 12px apart). */
export function BarListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonRegion testId="bar-list-skeleton">
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-3.5 shrink-0 basis-[42%]" />
            <Skeleton className="h-7 flex-1 rounded" />
          </div>
        ))}
      </div>
      {/* Axis row and legend row of the real chart. */}
      <div className="flex h-7 items-center justify-between">
        <Skeleton className="h-2.5 w-10" />
        <Skeleton className="h-2.5 w-12" />
        <Skeleton className="h-2.5 w-14" />
      </div>
      <div className="flex h-8 items-center justify-center gap-2">
        <Skeleton className="h-2.5 w-2.5 rounded-full" />
        <Skeleton className="h-3 w-32" />
      </div>
    </SkeletonRegion>
  )
}

/** Analytics overview — KPI cards, dynamics chart and the two ranking cards. */
export function AnalyticsOverviewSkeleton() {
  return (
    <SkeletonRegion className="space-y-5" testId="analytics-overview-skeleton">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-11 w-[210px] rounded-lg" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={`${adminCard} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-5" />
            </div>
            <Skeleton className="mt-2 h-9 w-28" />
            <Skeleton className="mt-2 h-4 w-full" />
          </div>
        ))}
      </div>

      <section className={`${adminCard} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-1.5 h-4 w-64 max-w-full" />
          </div>
          <Skeleton className="h-11 w-[190px] rounded-lg" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-32 rounded-full" />
          <Skeleton className="h-8 w-36 rounded-full" />
        </div>
        <div className="mt-4">
          <ChartSkeleton height={280} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-52" />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1].map((index) => (
          <section key={index} className={`${adminCard} p-5 sm:p-6`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-1.5 h-4 w-52 max-w-full" />
              </div>
              <Skeleton className="h-5 w-5" />
            </div>
            <div className="mt-5">
              <BarListSkeleton />
            </div>
            <Skeleton className="mt-3 h-4 w-3/4" />
          </section>
        ))}
      </div>
    </SkeletonRegion>
  )
}

/** Analytics — the product search list inside the comparison panel. */
export function CompareProductsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <SkeletonRegion className="space-y-1 px-1 py-1" testId="compare-products-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-2 px-1 py-1.5">
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          <Skeleton className="h-3.5 min-w-0 flex-1" />
          <Skeleton className="h-3 w-16 shrink-0" />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Product statistics dialog — KPI tiles, dynamics chart and rating distribution. */
export function ProductStatsSkeleton() {
  return (
    <SkeletonRegion className="space-y-4" testId="product-stats-skeleton">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className={`${adminCard} p-4`}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-8 w-20" />
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-1.5 h-3 w-32" />
          </div>
          <Skeleton className="h-10 w-[180px] rounded-lg" />
        </div>
        <div className="mt-4">
          <ChartSkeleton height={240} />
        </div>
      </section>

      <section className="rounded-xl border border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-1.5 h-3 w-44" />
          </div>
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="mt-4 space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-3 w-8 shrink-0" />
              <Skeleton className="h-4 flex-1 rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </SkeletonRegion>
  )
}

/** `/admin/products/new` and `/admin/products/:id/edit` — the form structure. */
export function AdminProductFormSkeleton({ withTabs = true }: { withTabs?: boolean }) {
  return (
    <SkeletonRegion testId="admin-product-form-skeleton">
      <section className={`${adminCard} px-5 py-6 sm:px-8 sm:py-8`}>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />

        {withTabs && (
          <div className="mt-6 border-b border-border">
            <div className="flex gap-6 py-3">
              <Skeleton className="h-10 w-36" />
              <Skeleton className="h-10 w-40" />
            </div>
          </div>
        )}

        <div className="mt-6 space-y-8">
          {/* Основная информация: name, then price / stock / status. */}
          <section>
            <Skeleton className="h-6 w-48" />
            <div className="mt-4 space-y-4">
              <div>
                <Skeleton className="mb-1.5 h-4 w-24" />
                <Skeleton className="h-11 w-full rounded-lg" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {[0, 1, 2].map((index) => (
                  <div key={index}>
                    <Skeleton className="mb-1.5 h-4 w-24" />
                    <Skeleton className="h-11 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Галерея товара: 3:2 tiles in the editor's own grid. */}
          <section className="border-t border-border pt-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-2 h-4 w-72 max-w-full" />
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className="aspect-[3/2] w-full rounded-lg" />
              ))}
            </div>
          </section>

          {/* Описание товара. */}
          <section className="border-t border-border pt-6">
            <Skeleton className="h-6 w-36" />
            <div className="mt-4">
              <Skeleton className="mb-1.5 h-4 w-32" />
              <Skeleton className="h-[110px] w-full rounded-lg" />
            </div>
          </section>

          {/* Категория и классификация. */}
          <section className="border-t border-border pt-6">
            <Skeleton className="h-6 w-56" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((index) => (
                <div key={index}>
                  <Skeleton className="mb-1.5 h-4 w-28" />
                  <Skeleton className="h-11 w-full rounded-lg" />
                </div>
              ))}
            </div>
          </section>

          {/* Характеристики. */}
          <section className="border-t border-border pt-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-2 h-4 w-72 max-w-full" />
            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <div className="bg-surface-2 px-4 py-3">
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="space-y-3 border-t border-border bg-surface p-4">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="grid gap-3 sm:grid-cols-2">
                    <Skeleton className="h-11 w-full rounded-lg" />
                    <Skeleton className="h-11 w-full rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-6">
            <Skeleton className="h-11 w-32 rounded-lg" />
            <Skeleton className="h-11 w-40 rounded-lg" />
          </div>
        </div>
      </section>
    </SkeletonRegion>
  )
}
