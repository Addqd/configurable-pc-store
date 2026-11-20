import { useTranslation } from 'react-i18next'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { niceAxisMax } from '../../admin/params'
import { estimateTextWidth, useElementWidth } from '../../admin/useElementWidth'
import { tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from './chartTheme'

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
  /** Axis tick formatter; compact notation is fine to keep labels readable. */
  formatValue?: (value: number) => string
  /**
   * Tooltip formatter, defaulting to `formatValue`. Pass an exact formatter when
   * the axis uses a compact approximation: a tooltip must never round the amount.
   */
  formatTooltipValue?: (value: number) => string
  height?: number
  ariaLabel: string
}

/**
 * Approved desktop geometry of the chart drawing area, in reference units.
 *
 * The chart keeps this coordinate system and scales every internal size with the
 * available width, exactly like the previous rendering did, so replacing the
 * chart engine does not resize the chart, the card around it or the page.
 */
const BASE_WIDTH = 720
const MIN_WIDTH = 200
const MARGIN = { top: 18, bottom: 34, left: 56 }
/** Gap between a y-axis label and the plot area, in reference units. */
const AXIS_TICK_MARGIN = 10
const AXIS_FONT_SIZE = 11
/** Height of the legend row below the plot: the previous markup was 24px tall. */
const LEGEND_HEIGHT = 24
const Y_AXIS_MAX_SHARE = 0.45

/** Data-point key of a series; names are arbitrary product names, so indexes are safer. */
const dataKeyOf = (index: number) => `series${index}`

/**
 * Pixel scale of the drawing area.
 *
 * Wide containers keep the 720-unit reference geometry and therefore grow, which
 * is the approved desktop rendering. Containers between 200 and 720 pixels are
 * drawn 1:1 so 11px axis text stays 11px instead of shrinking with the drawing.
 */
function chartScale(containerWidth: number): number {
  return containerWidth / Math.max(MIN_WIDTH, Math.min(BASE_WIDTH, containerWidth))
}

/** Small dependency-free legend, rendered through the Recharts `Legend` slot. */
function ChartLegend({ series }: { series: ChartSeries[] }) {
  return (
    <div className="flex h-full flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-text-secondary">
      {series.map((item, index) => (
        <span key={dataKeyOf(index)} className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
          {item.name}
        </span>
      ))}
    </div>
  )
}

/**
 * Sales-dynamics line chart: Recharts `LineChart` with Recharts axes, a dashed
 * horizontal grid, one line per series and an interactive tooltip.
 */
export function LineChart({
  series,
  formatValue = (value) => String(value),
  formatTooltipValue,
  height = 280,
  ariaLabel,
}: LineChartProps) {
  const { t } = useTranslation()
  const formatTooltip = formatTooltipValue ?? formatValue
  const [containerRef, containerWidth] = useElementWidth(BASE_WIDTH)
  const labels = series[0]?.points.map((point) => point.label) ?? []
  const scale = chartScale(containerWidth)
  const fontSize = AXIS_FONT_SIZE * scale
  const maxValue = niceAxisMax(Math.max(0, ...series.flatMap((item) => item.points.map((point) => point.value))))
  const fractions = [0, 0.25, 0.5, 0.75, 1]
  const ticks = fractions.map((fraction) => maxValue * fraction)
  const tickTexts = ticks.map((tick) => formatValue(tick))
  // A long formatted value (for example `4 720 000 ₽`) would be clipped by the
  // fixed reference margin, so the axis takes exactly the room its own labels need.
  const widestTick = Math.max(0, ...tickTexts.map((text) => estimateTextWidth(text, fontSize)))
  const yAxisWidth = Math.min(
    Math.max(MARGIN.left * scale, widestTick + AXIS_TICK_MARGIN * scale),
    Math.round(Math.max(Math.min(BASE_WIDTH, containerWidth) * Y_AXIS_MAX_SHARE)),
  )
  const rows = labels.map((label, index) => {
    const row: Record<string, string | number> = { label }
    for (const [seriesIndex, item] of series.entries()) {
      row[dataKeyOf(seriesIndex)] = item.points[index]?.value ?? 0
    }
    return row
  })
  const empty = series.length === 0 || labels.length === 0
  const chartHeight = Math.round(height * scale) + LEGEND_HEIGHT
  // The final x-axis label is centred on the last data point, so its right half
  // would leave the drawing. Reserving it keeps long labels (for example
  // `Ноя 2026`) unclipped without moving anything for short ones.
  const lastLabelWidth = estimateTextWidth(labels[labels.length - 1] ?? '', fontSize)
  const rightMargin = Math.max(16 * scale, Math.ceil(lastLabelWidth / 2) + 4 * scale)

  return (
    <div ref={containerRef}>
      {empty ? (
        <p className="py-12 text-center text-sm text-text-muted">{t('admin.analytics.no_data')}</p>
      ) : (
        <RechartsLineChart
          responsive
          width="100%"
          height={chartHeight}
          data={rows}
          title={ariaLabel}
          margin={{ top: MARGIN.top * scale, right: rightMargin, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="4 4" />
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={false}
            height={MARGIN.bottom * scale}
            tickMargin={AXIS_TICK_MARGIN * scale}
            tick={{ fontSize, fill: 'var(--color-text-secondary)' }}
          />
          <YAxis
            type="number"
            domain={[0, maxValue]}
            ticks={ticks}
            width={yAxisWidth}
            tickFormatter={formatValue}
            tickLine={false}
            axisLine={false}
            tickMargin={AXIS_TICK_MARGIN * scale}
            tick={{ fontSize, fill: 'var(--color-text-muted)' }}
          />
          <Tooltip
            cursor={{ stroke: 'var(--color-border-hover)', strokeDasharray: '4 4' }}
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
            formatter={(value, name) => [formatTooltip(Number(value)), name]}
          />
          <Legend verticalAlign="bottom" height={LEGEND_HEIGHT} content={<ChartLegend series={series} />} />
          {series.map((item, index) => (
            <Line
              key={dataKeyOf(index)}
              type="linear"
              dataKey={dataKeyOf(index)}
              name={item.name}
              stroke={item.color}
              strokeWidth={2.5 * scale}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 3.5 * scale, fill: item.color, strokeWidth: 0 }}
              activeDot={{ r: 5.5 * scale, fill: item.color, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
        </RechartsLineChart>
      )}
    </div>
  )
}
