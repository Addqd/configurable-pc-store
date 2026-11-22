import { Skeleton } from '../ui/skeleton'
import { SkeletonRegion } from './SkeletonRegion'

/**
 * Storefront skeletons.
 *
 * Every skeleton in this file reproduces the geometry of the component it
 * replaces: the same borders, paddings, image sizes, grid tracks, line heights
 * and control sizes. That is what keeps the swap to real content free of layout
 * shifts. Page-level skeletons are `SkeletonRegion`s; the smaller parts are plain
 * markup that a region wraps, so a page never announces the wait twice.
 */

/** `/` — one card of the home "prebuilt/gpu/cpu/mobo" sections. */
function ProductCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-3 p-3">
        <Skeleton className="h-16 w-16 shrink-0" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="mt-0.5 h-4 w-3/5" />
          <Skeleton className="mt-0.5 h-4 w-2/5" />
          <Skeleton className="mt-1 h-5 w-20" />
        </div>
        <Skeleton className="h-9 w-9 shrink-0" />
      </div>
    </div>
  )
}

/** `/` — the product grid of one home section. */
export function ProductSectionSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <SkeletonRegion
      className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
      testId="product-section-skeleton"
    >
      {Array.from({ length: cards }, (_, index) => <ProductCardSkeleton key={index} />)}
    </SkeletonRegion>
  )
}

/** `/catalog` — one card of the catalogue grid (4:3 cover, text block, actions). */
function CatalogCardSkeleton() {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-1 flex-col p-2.5">
        <Skeleton className="mb-0.5 h-4 w-1/3" />
        <div className="mb-1 min-h-[2.5rem] space-y-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
        <div className="mb-1 min-h-[2rem] space-y-1">
          <Skeleton className="h-2.5 w-3/4" />
          <Skeleton className="h-2.5 w-2/3" />
        </div>
        <Skeleton className="mt-auto h-5 w-16" />
        <Skeleton className="mt-1 mb-1.5 h-5 w-20" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  )
}

/** `/catalog` — one page of the catalogue: 49 products, exactly like a loaded page. */
export function CatalogGridSkeleton({ count = 49 }: { count?: number }) {
  return (
    <SkeletonRegion
      className="flex flex-wrap justify-center gap-3"
      testId="catalog-grid-skeleton"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="w-[calc((100%-0.75rem)/2)] min-w-0 sm:w-[calc((100%-1.5rem)/3)] md:w-[calc((100%-2.25rem)/4)] lg:w-[calc((100%-3rem)/5)] xl:w-[calc((100%-4.5rem)/7)]"
        >
          <CatalogCardSkeleton />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** Header search dropdown — suggestion rows while the settled term is loading. */
export function SearchResultsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonRegion className="space-y-1 px-2" testId="search-results-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-lg p-2">
          <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
          <Skeleton className="h-4 min-w-0 flex-1" />
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** `/catalog` — the filter option groups inside the drawer, while metadata loads. */
export function FilterOptionsSkeleton() {
  return (
    <SkeletonRegion className="space-y-4" testId="filter-options-skeleton">
      {[0, 1, 2, 3].map((section) => (
        <section key={section} className="border-b border-border pb-4 last:border-b-0">
          <div className="mb-2 flex w-full items-center justify-between py-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-4" />
          </div>
          <div className="space-y-2">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-2.5">
                <Skeleton className="h-4 w-4 shrink-0" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </SkeletonRegion>
  )
}

/** `/products/:slug` — gallery, purchase panel and the content sections below it. */
export function ProductPageSkeleton() {
  return (
    <SkeletonRegion
      className="mx-auto w-full max-w-[1320px] px-4 pb-8 pt-24"
      testId="product-page-skeleton"
    >
      <Skeleton className="mb-5 h-9 w-28 rounded-lg" />

      <div className="grid grid-cols-1 gap-6 rounded-2xl border border-border bg-surface p-4 sm:p-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="min-w-0 lg:pr-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <Skeleton className="aspect-square min-w-0 flex-1 rounded-2xl" />
            <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-16 w-16 shrink-0 rounded-lg sm:h-20 sm:w-20" />
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <Skeleton className="mb-2 h-3.5 w-24" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="mt-2 h-6 w-3/4" />
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="mt-4 h-4 w-32" />
          <div className="mt-5 flex items-center justify-between gap-3 border-b border-border pb-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="mt-5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="mt-2 h-9 w-40" />
            <Skeleton className="mt-2.5 h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-40" />
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Skeleton className="h-12 w-36 shrink-0 rounded-xl" />
            <Skeleton className="h-12 flex-1 rounded-xl" />
          </div>
          <Skeleton className="mt-3 h-12 w-full rounded-xl" />
          <div className="mt-5 flex items-center justify-around border-t border-border pt-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <Skeleton className="mb-3 h-7 w-40" />
        <div className="space-y-0.5">
          <Skeleton className="h-[22px] w-full" />
          <Skeleton className="h-[22px] w-full" />
          <Skeleton className="h-[22px] w-full" />
          <Skeleton className="h-[22px] w-full" />
          <Skeleton className="h-[22px] w-2/3" />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <Skeleton className="mb-4 h-7 w-44" />
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-5 w-full" />)}
        </div>
        <Skeleton className="mt-5 h-10 w-44 rounded-xl" />
      </div>

      <div className="mb-8 mt-6 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-16" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-10 w-32 rounded-xl" />
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
        </div>
        <div className="space-y-2 py-5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </SkeletonRegion>
  )
}

/** `/products/:slug` — the review list while its own request is pending. */
export function ProductReviewsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <SkeletonRegion className="space-y-4" testId="product-reviews-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="border-b border-border pb-4 last:border-0 last:pb-0">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <Skeleton className="h-4 min-w-0 flex-1" />
            <Skeleton className="h-4 w-24 shrink-0" />
          </div>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  )
}

/** `/cart` — the order summary panel. Plain markup: the page region wraps it. */
export function OrderSummarySkeleton() {
  return (
    <aside className="sticky top-20 rounded-2xl border border-border bg-surface p-5 shadow-[0_5px_24px_var(--color-shadow)] sm:p-6">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="space-y-3 border-b border-border py-5">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 py-5">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-8 w-28" />
      </div>
      <Skeleton className="h-13 w-full rounded-xl" />
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-4">
        <Skeleton className="h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-1 h-4 w-full" />
        </div>
      </div>
    </aside>
  )
}

/** `/cart` — cart rows and the summary during the first cart request. */
export function CartSkeleton() {
  return (
    <SkeletonRegion
      className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]"
      testId="cart-skeleton"
    >
      <div className="min-w-0 rounded-2xl border border-border bg-surface p-3 shadow-[0_5px_24px_var(--color-shadow)] sm:p-4">
        <div className="divide-y divide-border">
          {[0, 1].map((index) => (
            <div key={index} className="flex flex-col gap-4 px-3 py-5 sm:px-4 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <Skeleton className="h-28 w-28 shrink-0 rounded-lg sm:h-32 sm:w-36" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-2/3" />
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 sm:gap-5 md:justify-end">
                <Skeleton className="h-10 w-28 rounded-lg" />
                <Skeleton className="h-5 min-w-24" />
                <Skeleton className="h-6 w-6 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="min-w-0">
        <OrderSummarySkeleton />
      </div>
    </SkeletonRegion>
  )
}

/** `/account` — the whole profile page while the session is being restored. */
export function AccountSkeleton() {
  return (
    <SkeletonRegion
      className="mx-auto w-full max-w-[1120px] space-y-5"
      testId="account-skeleton"
    >
      <Skeleton className="h-9 w-28 rounded-lg" />
      <section className="rounded-xl border border-border bg-surface p-6 shadow-[0_5px_24px_var(--color-shadow)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <Skeleton className="h-36 w-36 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="mb-3 h-7 w-52" />
            <Skeleton className="h-6 w-44" />
            <Skeleton className="mt-2 h-4 w-56" />
            <Skeleton className="mt-4 h-11 w-40 rounded-lg" />
          </div>
          <div className="grid w-full grid-cols-2 gap-4 lg:w-auto">
            {[0, 1].map((index) => (
              <div key={index} className="min-w-0 rounded-xl border border-border bg-surface-2 p-5 lg:w-[160px]">
                <Skeleton className="mb-3 h-14 w-14 rounded-full" />
                <Skeleton className="mb-1 h-4 w-20" />
                <Skeleton className="h-8 w-12" />
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="rounded-xl border border-border bg-surface p-6 shadow-[0_5px_24px_var(--color-shadow)] sm:p-8">
        <Skeleton className="mb-5 h-7 w-56" />
        <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[0, 1].map((index) => (
            <div key={index}>
              <Skeleton className="mb-2 h-4 w-24" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <Skeleton className="h-12 w-44 rounded-lg" />
      </section>
    </SkeletonRegion>
  )
}

/** `/account` — one asynchronous statistic tile value (orders, reviews). */
export function AccountStatValueSkeleton() {
  return <Skeleton className="h-9 w-14" />
}

/** `/account/orders` — the order history cards. */
export function OrdersSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <SkeletonRegion className="space-y-4" testId="orders-skeleton">
      {Array.from({ length: cards }, (_, index) => (
        <article
          key={index}
          className="rounded-xl border border-border bg-surface p-3 shadow-[0_5px_24px_var(--color-shadow)] sm:p-4"
        >
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            {[0, 1].map((row) => (
              <div
                key={row}
                className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 border-b border-border px-3 py-3 last:border-0 sm:grid-cols-[100px_minmax(0,1fr)_auto] sm:gap-5 sm:px-5"
              >
                <Skeleton className="h-[68px] w-[72px] rounded-lg sm:h-[72px] sm:w-[100px]" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="col-start-2 h-4 w-24 sm:col-start-auto" />
              </div>
            ))}
          </div>
        </article>
      ))}
    </SkeletonRegion>
  )
}

/** `/builds` — one saved build card. */
function SavedBuildCardSkeleton() {
  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface p-3 shadow-[0_5px_24px_var(--color-shadow)] sm:p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <Skeleton className="h-[104px] w-[136px] shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-36" />
          </div>
        </div>
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          <Skeleton className="mr-1 h-7 w-24" />
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface-2">
        <div className="px-3 py-2">
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="border-t border-border px-3 pb-2">
          <div className="grid grid-cols-1 gap-x-6 md:grid-flow-col md:grid-cols-2 md:grid-rows-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
              <div
                key={row}
                className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] items-center gap-2 border-b border-border py-1.5 sm:grid-cols-[40px_minmax(0,1fr)]"
              >
                <Skeleton className="h-9 w-9 rounded-md sm:h-10 sm:w-10" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  )
}

/** `/builds` — the saved build list during its first request. */
export function SavedBuildsSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <SkeletonRegion className="space-y-4" testId="saved-builds-skeleton">
      {Array.from({ length: cards }, (_, index) => <SavedBuildCardSkeleton key={index} />)}
    </SkeletonRegion>
  )
}

/**
 * `/builds` — the compatibility verdict of one card.
 *
 * The owner card stays interactive while its own compatibility check runs; only
 * the verdict line is a placeholder, so nothing about the build itself is hidden.
 */
export function SavedBuildCompatibilitySkeleton() {
  return (
    <SkeletonRegion className="inline-flex items-center" testId="saved-build-compatibility-skeleton">
      <Skeleton className="h-4 w-40" />
    </SkeletonRegion>
  )
}
