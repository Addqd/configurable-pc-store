import { Skeleton } from '../ui/skeleton'
import { SkeletonRegion } from './SkeletonRegion'

/** `/builder` — the product rows inside the component selector dialog. */
export function BuilderSelectorSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <SkeletonRegion className="space-y-2" testId="builder-selector-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex w-full min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border p-3 sm:flex-nowrap"
        >
          <Skeleton className="h-14 w-14 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </SkeletonRegion>
  )
}

/**
 * `/builder` — the compatibility verdict in the summary sidebar.
 *
 * Only the verdict line is a placeholder: the selected components, their prices,
 * the total and the configuration itself stay visible and editable.
 */
export function BuilderCompatibilitySkeleton() {
  return (
    <SkeletonRegion className="inline-flex items-center" testId="builder-compatibility-skeleton">
      <Skeleton className="h-4 w-24" />
    </SkeletonRegion>
  )
}
