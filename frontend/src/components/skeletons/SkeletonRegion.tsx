import { createContext, useContext, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface SkeletonRegionProps {
  /** What is being loaded, for screen readers. Defaults to the shared loading label. */
  label?: string
  className?: string
  testId?: string
  children: ReactNode
}

/** True inside a region that already owns the loading announcement. */
const InsideSkeletonRegion = createContext(false)

/**
 * Accessible wrapper for a group of placeholders.
 *
 * The region announces the wait exactly once (`role="status"` + one visually
 * hidden label), while every placeholder inside is decorative. Keeping the label
 * as the only text of the region also means the region reads as "Загрузка…" for
 * assistive technology instead of a stream of empty elements.
 *
 * The region deliberately carries no `aria-busy`: a live region that stays busy
 * for its whole lifetime asks assistive technology to hold its announcements
 * until it becomes idle, and it is unmounted before that ever happens.
 *
 * A skeleton used inside another skeleton (a chart inside an analytics overview,
 * a table inside the admin panel) must not open its own live region: it would
 * repeat one announcement for a single loading operation. Only the outermost
 * region announces; the nested one keeps its markup, classes and test id.
 */
export function SkeletonRegion({ label, className, testId, children }: SkeletonRegionProps) {
  const { t } = useTranslation()
  const nested = useContext(InsideSkeletonRegion)
  if (nested) return <div data-testid={testId} className={className}>{children}</div>
  return (
    <InsideSkeletonRegion.Provider value={true}>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid={testId}
        className={className}
      >
        <span className="sr-only">{label ?? t('common.loading')}</span>
        {children}
      </div>
    </InsideSkeletonRegion.Provider>
  )
}
