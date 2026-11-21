import {
  Bar,
  BarChart,
  LabelList,
  Rectangle,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { estimateTextWidth } from '../../admin/useElementWidth'
import { tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from './chartTheme'

export interface RatingBucket {
  rating: number
  count: number
}

interface RatingDistributionProps {
  distribution: RatingBucket[]
  categoryLabel: string
}

/** Amber of the star ratings; the golden bar colour is part of the approved design. */
const RATING_BAR_COLOR = '#fbbf24'
/** Previous geometry: a 16px rounded bar with 8px between the five rows. */
const BAR_HEIGHT = 16
const BAR_RADIUS = 8
const ROW_GAP = 8
/** Star scale on the left and the reserved room of the review count on the right. */
const RATING_COLUMN_WIDTH = 32
const LABEL_GAP = 12
const COUNT_COLUMN_WIDTH = 40
const FONT_SIZE = 12
const COUNT_GAP = 6
const INSIDE_LABEL_PADDING = 8

const RATINGS = [5, 4, 3, 2, 1]

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

/** Review count of one rating bucket, drawn on the bar or right beside its end. */
function CountLabel({ ...props }: ValueLabelEntry) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Number(props.width ?? 0)
  const height = Number(props.height ?? 0)
  const text = String(props.value ?? 0)
  const fitsInside = width >= estimateTextWidth(text, FONT_SIZE) + INSIDE_LABEL_PADDING * 2
  return (
    <text
      x={fitsInside ? x + width - INSIDE_LABEL_PADDING : x + width + COUNT_GAP}
      y={y + height / 2}
      textAnchor={fitsInside ? 'end' : 'start'}
      dominantBaseline="central"
      fontSize={FONT_SIZE}
      fontWeight={fitsInside ? 600 : 400}
      fill={fitsInside ? '#0f172a' : 'var(--color-text-secondary)'}
    >
      {text}
    </text>
  )
}

/**
 * Rating distribution of one product: the five buckets from five down to one star,
 * each rendered as a horizontal Recharts bar with its exact review count.
 */
export function RatingDistributionChart({ distribution, categoryLabel }: RatingDistributionProps) {
  const maxCount = Math.max(0, ...distribution.map((bucket) => bucket.count))
  const data = RATINGS.map((rating) => ({
    rating,
    count: distribution.find((bucket) => bucket.rating === rating)?.count ?? 0,
  }))
  const chartHeight = RATINGS.length * BAR_HEIGHT + (RATINGS.length - 1) * ROW_GAP

  const ratingTick = (props: AxisTickEntry) => (
    <text
      x={props.x}
      y={props.y}
      textAnchor="end"
      dominantBaseline="central"
      fontSize={FONT_SIZE}
      fill="var(--color-text-secondary)"
    >
      {String(props.payload?.value ?? '')}
      <tspan fill={RATING_BAR_COLOR}> ★</tspan>
    </text>
  )

  return (
    <BarChart
      responsive
      width="100%"
      height={chartHeight}
      data={data}
      layout="vertical"
      title={categoryLabel}
      margin={{ top: 0, right: COUNT_COLUMN_WIDTH, bottom: 0, left: 0 }}
    >
      <XAxis type="number" domain={[0, maxCount > 0 ? maxCount : 1]} hide />
      <YAxis
        type="category"
        dataKey="rating"
        width={RATING_COLUMN_WIDTH + LABEL_GAP}
        interval={0}
        tickLine={false}
        axisLine={false}
        tick={ratingTick}
      />
      <Tooltip
        cursor={{ fill: 'var(--color-surface-3)', fillOpacity: 0.6, stroke: 'none' }}
        contentStyle={tooltipContentStyle}
        labelStyle={tooltipLabelStyle}
        itemStyle={tooltipItemStyle}
        labelFormatter={(label) => `${String(label)} ★`}
        formatter={(value) => [String(value), categoryLabel]}
      />
      <Bar
        dataKey="count"
        name={categoryLabel}
        fill={RATING_BAR_COLOR}
        barSize={BAR_HEIGHT}
        background={{ fill: 'var(--color-surface-3)', radius: BAR_RADIUS }}
        shape={<Rectangle radius={BAR_RADIUS} />}
        isAnimationActive={false}
      >
        <LabelList dataKey="count" content={(props) => <CountLabel {...(props as ValueLabelEntry)} />} />
      </Bar>
    </BarChart>
  )
}
