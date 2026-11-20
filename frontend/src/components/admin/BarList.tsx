import { useTranslation } from 'react-i18next'

export interface BarItem {
  key: string | number
  label: string
  value: number
  barValue?: number
  meta?: string
}

const BAR_COLORS = ['#2563eb', '#8b5cf6', '#f97316', '#16a34a', '#ef4444']

interface BarListProps {
  items: BarItem[]
  max: number
  axisLabels: [string, string, string]
  legend: string
  formatValue?: (value: number) => string
  ariaLabel: string
}

/** Horizontal comparison bars used by the "Лидеры продаж" / "Лучшие по отзывам" cards. */
export function BarList({ items, max, axisLabels, legend, formatValue = (value) => String(value), ariaLabel }: BarListProps) {
  const { t } = useTranslation()
  if (items.length === 0) {
    return <p className="py-12 text-center text-sm text-text-muted">{t('admin.analytics.no_data')}</p>
  }
  const safeMax = max > 0 ? max : 1
  return (
    <div>
      <div className="space-y-3" role="list" aria-label={ariaLabel}>
        {items.map((item, index) => {
          const barValue = item.barValue ?? item.value
          const width = Math.max(2, Math.min(100, (barValue / safeMax) * 100))
          return (
            <div key={item.key} role="listitem" className="grid grid-cols-[minmax(0,42%)_1fr] items-center gap-3">
              <span className="truncate text-right text-xs text-text-secondary sm:text-sm" title={item.label}>
                {item.label}
              </span>
              <div className="flex items-center gap-2">
                <div className="h-7 flex-1 overflow-hidden rounded-sm bg-surface-3">
                  <div
                    className="h-full rounded-sm transition-[width]"
                    style={{ width: `${width}%`, backgroundColor: BAR_COLORS[index % BAR_COLORS.length] }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,42%)_1fr] gap-3">
        <span />
        <div className="flex justify-between text-[11px] text-text-muted">
          <span>{axisLabels[0]}</span>
          <span>{axisLabels[1]}</span>
          <span>{axisLabels[2]}</span>
        </div>
      </div>

      <p className="mt-4 flex items-center justify-center gap-2 text-xs text-text-secondary">
        <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" aria-hidden="true" />
        {legend}
      </p>
      <span className="sr-only">
        {items.map((item) => `${item.label}: ${formatValue(item.value)}`).join(', ')}
      </span>
    </div>
  )
}
