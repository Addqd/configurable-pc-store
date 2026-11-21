import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface SkeletonRegionProps {
  /** What is being loaded, for screen readers. Defaults to the shared loading label. */
  label?: string
  className?: string
  testId?: string
  children: ReactNode
}

/**
 * Accessible wrapper for a group of placeholders.
 *
 * The region announces the wait exactly once (`role="status"` + one visually
 * hidden label), while every placeholder inside is decorative. Keeping the label
 * as the only text of the region also means the region reads as "Загрузка…" for
 * assistive technology instead of a stream of empty elements.
 */
export function SkeletonRegion({ label, className, testId, children }: SkeletonRegionProps) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy="true" data-testid={testId} className={className}>
      <span className="sr-only">{label ?? t('common.loading')}</span>
      {children}
    </div>
  )
}
