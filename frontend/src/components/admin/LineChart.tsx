import { useTranslation } from 'react-i18next'
import { niceAxisMax } from '../../admin/params'

export interface ChartPoint {
  label: string
  value: number
}

export interface ChartSeries {
  name: string
  color: string
  points: ChartPoint[]
}

interface LineChartProps {
  series: ChartSeries[]
  formatValue?: (value: number) => string
  height?: number
  ariaLabel: string
}

const WIDTH = 720
const MARGIN = { top: 18, right: 16, bottom: 34, left: 56 }

/** Small dependency-free SVG line chart with axes, grid and a legend. */
export function LineChart({ series, formatValue = (value) => String(value), height = 280, ariaLabel }: LineChartProps) {
  const { t } = useTranslation()
  const labels = series[0]?.points.map((point) => point.label) ?? []
  const maxValue = niceAxisMax(Math.max(0, ...series.flatMap((item) => item.points.map((point) => point.value))))
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = height - MARGIN.top - MARGIN.bottom
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const x = (index: number) => MARGIN.left + (labels.length <= 1 ? plotWidth / 2 : (index / (labels.length - 1)) * plotWidth)
  const y = (value: number) => MARGIN.top + plotHeight - (value / maxValue) * plotHeight

  if (series.length === 0 || labels.length === 0) {
    return <p className="py-12 text-center text-sm text-text-muted">{t('admin.analytics.no_data')}</p>
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {ticks.map((tick) => {
          const value = maxValue * tick
          return (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={y(value)}
                y2={y(value)}
                stroke="var(--color-border)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={MARGIN.left - 10}
                y={y(value) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--color-text-muted)"
              >
                {formatValue(value)}
              </text>
            </g>
          )
        })}

        {labels.map((label, index) => (
          <text
            key={`${label}-${index}`}
            x={x(index)}
            y={height - 10}
            textAnchor="middle"
            fontSize="11"
            fill="var(--color-text-secondary)"
          >
            {label}
          </text>
        ))}

        {series.map((item) => {
          const points = item.points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')
          return (
            <g key={item.name}>
              <polyline
                points={points}
                fill="none"
                stroke={item.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {item.points.map((point, index) => (
                <circle key={index} cx={x(index)} cy={y(point.value)} r="3.5" fill={item.color} />
              ))}
            </g>
          )
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {series.map((item) => (
          <span key={item.name} className="inline-flex items-center gap-2 text-xs text-text-secondary">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  )
}
