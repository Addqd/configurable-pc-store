import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  LabelList,
  Legend,
  Rectangle,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { estimateTextWidth, truncateText, useElementWidth } from '../../admin/useElementWidth'
import { CHART_BAR_COLOR, tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from './chartTheme'

export interface BarItem {
  key: string | number
  label: string
  value: number
  barValue?: number
  meta?: string
}

interface BarListProps {
  items: BarItem[]
  max: number
  axisLabels: [string, string, string]
  legend: string
  formatValue?: (value: number) => string
  ariaLabel: string
}

/** Previous geometry of a ranking row: a 28px bar with 12px between rows. */
const BAR_HEIGHT = 28
const BAR_RADIUS = 4
const ROW_GAP = 12
/** Axis row below the bars: 12px gap plus the 11px tick labels. */
const AXIS_HEIGHT = 28
/** Legend row: 16px gap plus 16px of text. */
const LEGEND_HEIGHT = 32
/** Width share of the product-name column and the gap that follows it. */
const LABEL_COLUMN_RATIO = 0.42
const COLUMN_GAP = 12
const MIN_PLOT_WIDTH = 120
const AXIS_FONT_SIZE = 11
const VALUE_FONT_SIZE = 11
/** Space between a bar and its value label. */
const VALUE_GAP = 6
const SMALL_TEXT_WIDTH = 640

/** Categories are product names, so their key never collides with a series. */
const NAME_KEY = 'name'
const VALUE_KEY = 'value'

/** Space kept free next to a value label that sits inside its bar. */
const INSIDE_LABEL_PADDING = 8

interface ValueLabelEntry {
  x?: number
  y?: number
  width?: number
  height?: number
  value?: unknown
}

interface AxisTickEntry {
  x?: number | string
  y?: number | string
  payload?: { value?: unknown }
}

/**
 * Numeric value of every bar, drawn **inside** the blue bar.
 *
 * A ranking row with a very small positive value would otherwise produce a bar
 * shorter than its own label, so `BarList` raises the *visual* length of such a
 * bar to the label width with Recharts' `minPointSize` (see `minBarWidth`). The
 * label itself therefore always uses one identical white style. A zero value
 * stays a zero-length row: its `0` is drawn beside the empty track in the
 * secondary text colour, so no bar pretends that something was sold.
 */
function BarValueLabel({ formatValue, ...props }: ValueLabelEntry & { formatValue: (value: number) => string }) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Number(props.width ?? 0)
  const height = Number(props.height ?? 0)
  const value = Number(props.value ?? 0)
  const text = formatValue(value)
  const insideBar = value > 0
  return (
    <text
      x={insideBar ? x + width - INSIDE_LABEL_PADDING : x + width + VALUE_GAP}
      y={y + height / 2}
      textAnchor={insideBar ? 'end' : 'start'}
      dominantBaseline="central"
      fontSize={VALUE_FONT_SIZE}
      fontWeight={600}
      fill={insideBar ? '#ffffff' : 'var(--color-text-secondary)'}
    >
      {text}
    </text>
  )
}

/** "Товаров в заказах" legend kept from the previous card layout. */
function BarLegend({ legend }: { legend: string }) {
  return (
    <p className="flex h-full items-center justify-center gap-2 text-xs text-text-secondary">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_BAR_COLOR }} aria-hidden="true" />
      {legend}
    </p>
  )
}

/**
 * Horizontal comparison bars of the "Лидеры продаж" / "Лучшие по отзывам" cards.
 *
 * All bars share one blue colour, the product names sit in the category axis and
 * every bar carries its own numeric value, so the value never has to be inferred
 * from the bar length.
 */
export function BarList({ items, max, axisLabels, legend, formatValue = (value) => String(value), ariaLabel }: BarListProps) {
  const { t } = useTranslation()
  const [containerRef, containerWidth] = useElementWidth(640)

  if (items.length === 0) {
    return <p className="py-12 text-center text-sm text-text-muted">{t('admin.analytics.no_data')}</p>
  }

  const safeMax = max > 0 ? max : 1
  const tickValues = [0, safeMax / 2, safeMax]
  const chartHeight = items.length * BAR_HEIGHT
    + Math.max(0, items.length - 1) * ROW_GAP
    + AXIS_HEIGHT
    + LEGEND_HEIGHT
  const nameFontSize = containerWidth >= SMALL_TEXT_WIDTH ? 14 : 12
  const nameWidth = Math.min(
    Math.round(LABEL_COLUMN_RATIO * containerWidth),
    Math.max(0, containerWidth - MIN_PLOT_WIDTH - COLUMN_GAP),
  )
  /** Width of the plot area, i.e. the length of a full-length bar. */
  const plotWidth = Math.max(0, containerWidth - nameWidth - COLUMN_GAP)
  /**
   * Smallest visual bar length that still holds its own formatted label.
   *
   * `minPointSize` receives the bar value, so the value keeps its real magnitude
   * in the data, tooltip and axis: only the drawn length is raised to the label
   * width, and never beyond the plot area.
   */
  const minBarWidth = (value: number) => {
    if (!(value > 0)) return 0
    const labelWidth = estimateTextWidth(formatValue(value), VALUE_FONT_SIZE) + INSIDE_LABEL_PADDING * 2
    return Math.min(labelWidth, plotWidth)
  }
  const data = items.map((item) => ({
    [NAME_KEY]: item.label,
    [VALUE_KEY]: item.barValue ?? item.value,
  }))

  const axisTickLabel = (props: AxisTickEntry) => {
    const value = Number(props.payload?.value ?? 0)
    const index = tickValues.indexOf(value)
    const text = axisLabels[index] ?? formatValue(value)
    // The previous axis row was justified: the first label started at the track
    // start and the last one ended at its end, so neither can overflow.
    const anchor = index <= 0 ? 'start' : index === tickValues.length - 1 ? 'end' : 'middle'
    return (
      <text
        x={props.x}
        y={props.y}
        dy={AXIS_FONT_SIZE + 2}
        textAnchor={anchor}
        fontSize={AXIS_FONT_SIZE}
        fill="var(--color-text-muted)"
      >
        {text}
      </text>
    )
  }

  const nameTickLabel = (props: AxisTickEntry) => {
    const full = String(props.payload?.value ?? '')
    const text = truncateText(full, nameWidth, nameFontSize)
    return (
      <text
        x={props.x}
        y={props.y}
        textAnchor="end"
        dominantBaseline="central"
        fontSize={nameFontSize}
        fill="var(--color-text-secondary)"
      >
        <title>{full}</title>
        {text}
      </text>
    )
  }

  return (
    <div>
      <div ref={containerRef}>
        <BarChart
          responsive
          width="100%"
          height={chartHeight}
          data={data}
          layout="vertical"
          title={ariaLabel}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <XAxis
            type="number"
            domain={[0, safeMax]}
            ticks={tickValues}
            interval={0}
            height={AXIS_HEIGHT}
            tickLine={false}
            axisLine={false}
            tick={axisTickLabel}
          />
          <YAxis
            type="category"
            dataKey={NAME_KEY}
            width={nameWidth + COLUMN_GAP}
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={nameTickLabel}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-surface-3)', fillOpacity: 0.6, stroke: 'none' }}
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
            formatter={(value) => [formatValue(Number(value)), legend]}
          />
          <Bar
            dataKey={VALUE_KEY}
            name={legend}
            fill={CHART_BAR_COLOR}
            barSize={BAR_HEIGHT}
            background={{ fill: 'var(--color-surface-3)', radius: BAR_RADIUS }}
            shape={<Rectangle radius={BAR_RADIUS} />}
            minPointSize={(value) => minBarWidth(Number(value ?? 0))}
            isAnimationActive={false}
          >
            <LabelList
              dataKey={VALUE_KEY}
              content={(props) => <BarValueLabel formatValue={formatValue} {...(props as ValueLabelEntry)} />}
            />
          </Bar>
          <Legend verticalAlign="bottom" height={LEGEND_HEIGHT} content={<BarLegend legend={legend} />} />
        </BarChart>
      </div>
      <span className="sr-only">
        {items.map((item) => `${item.label}: ${formatValue(item.value)}`).join(', ')}
      </span>
    </div>
  )
}
