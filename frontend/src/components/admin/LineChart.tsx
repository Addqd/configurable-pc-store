import { useEffect, useRef, useState } from 'react'
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

/** Desktop coordinate width; kept so the existing geometry renders unchanged. */
const WIDTH = 720
/** Narrowest viewBox the axis geometry still supports. */
const MIN_WIDTH = 200
const MARGIN = { top: 18, right: 16, bottom: 34, left: 56 }
const AXIS_FONT_SIZE = 11
/** Average glyph advance of the 11px axis font, in viewBox units. */
const GLYPH_WIDTH = 6.6
/** Free space kept around axis text. */
const LABEL_GAP = 12
/** Desktop slot reserved for one x-axis label; unchanged on wide screens. */
const LABEL_SLOT = 72
/** Smallest slot used when the labels themselves are shorter than the desktop slot. */
const MIN_LABEL_SLOT = 44

/** Conservative width estimate for axis text (SVG has no measured layout here). */
const estimateTextWidth = (text: string) => Math.ceil(text.length * GLYPH_WIDTH)

interface ChartLayout {
  width: number
  left: number
  right: number
  /** Slot reserved for one x-axis label. */
  labelSlot: number
}

/**
 * Tracks the available width of the chart container.
 *
 * The chart keeps its 720-unit coordinate system whenever the container is at
 * least that wide, so the desktop rendering is unchanged. Narrower containers are
 * drawn 1:1 instead of squeezing a wider viewBox into them: a shrunken viewBox
 * would scale the 11px axis text down with it and make the labels unreadable.
 */
function useChartWidth(fallback: number) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const element = containerRef.current
    // jsdom and other non-browser environments have no ResizeObserver.
    const Observer = element?.ownerDocument.defaultView?.ResizeObserver
    if (!element || !Observer) return
    const observer = new Observer((entries) => {
      const measured = Math.round(entries[0]?.contentRect.width ?? 0)
      if (measured > 0) setWidth(measured)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [containerRef, width] as const
}

/**
 * Geometry for the measured container.
 *
 * Wide containers return the desktop coordinates and margins untouched. Narrow
 * ones reserve exactly the room their own axis texts need, because at 1:1 one
 * viewBox unit is one pixel and the previously fixed 56-unit left margin would
 * clip longer y-axis values (for example `1 234 567 ₽`).
 */
function chartLayout(containerWidth: number, yLabels: string[], xLabels: string[]): ChartLayout {
  const width = Math.max(MIN_WIDTH, Math.min(WIDTH, containerWidth))
  // The final x-axis label is centred on the last data point, so its right half
  // would leave the drawing. Reserving it keeps long labels (for example
  // `Ноя 2026`) unclipped without moving anything for short ones.
  const lastLabelWidth = estimateTextWidth(xLabels[xLabels.length - 1] ?? '')
  const tightRight = Math.max(MARGIN.right, Math.ceil(lastLabelWidth / 2) + 4)
  if (width === WIDTH) {
    return { width: WIDTH, left: MARGIN.left, right: tightRight, labelSlot: LABEL_SLOT }
  }
  const widestY = Math.max(0, ...yLabels.map(estimateTextWidth))
  const widestX = Math.max(0, ...xLabels.map(estimateTextWidth))
  return {
    width,
    // Bounded so a long formatted value can never consume the whole plot.
    left: Math.min(Math.max(MARGIN.left, widestY + LABEL_GAP), Math.round(width * 0.45)),
    right: Math.min(tightRight, Math.round(width * 0.25)),
    labelSlot: Math.max(MIN_LABEL_SLOT, widestX + LABEL_GAP),
  }
}

/**
 * X-axis ticks that fit `plotWidth` without colliding.
 *
 * Only label text is sampled — every data point keeps its dot and line vertex.
 * Labels are picked at a regular step, a candidate that would sit closer than one
 * slot to the final label is dropped, and the final label is always kept.
 */
function selectAxisLabels(count: number, plotWidth: number, slot: number): Set<number> {
  if (count <= 1) return new Set(count === 1 ? [0] : [])
  const last = count - 1
  const maxLabels = Math.max(2, Math.floor(plotWidth / slot) + 1)
  const minGap = Math.max(1, Math.ceil((slot * last) / Math.max(plotWidth, 1)))
  const step = Math.max(minGap, Math.ceil(count / maxLabels))
  const selected: number[] = []
  for (let index = 0; index < last; index += step) {
    if (last - index >= minGap) selected.push(index)
  }
  selected.push(last)
  return new Set(selected)
}

/** Small dependency-free SVG line chart with axes, grid and a legend. */
export function LineChart({ series, formatValue = (value) => String(value), height = 280, ariaLabel }: LineChartProps) {
  const { t } = useTranslation()
  const [containerRef, containerWidth] = useChartWidth(WIDTH)
  const labels = series[0]?.points.map((point) => point.label) ?? []
  const maxValue = niceAxisMax(Math.max(0, ...series.flatMap((item) => item.points.map((point) => point.value))))
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const tickLabels = ticks.map((tick) => formatValue(maxValue * tick))
  const { width: viewWidth, left, right, labelSlot } = chartLayout(containerWidth, tickLabels, labels)
  const plotWidth = viewWidth - left - right
  const plotHeight = height - MARGIN.top - MARGIN.bottom
  const x = (index: number) => left + (labels.length <= 1 ? plotWidth / 2 : (index / (labels.length - 1)) * plotWidth)
  const y = (value: number) => MARGIN.top + plotHeight - (value / maxValue) * plotHeight
  const empty = series.length === 0 || labels.length === 0
  const visibleLabelIndexes = selectAxisLabels(labels.length, plotWidth, labelSlot)

  return (
    <div ref={containerRef}>
      {empty ? (
        <p className="py-12 text-center text-sm text-text-muted">{t('admin.analytics.no_data')}</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${viewWidth} ${height}`}
            className="h-auto w-full"
            role="img"
            aria-label={ariaLabel}
          >
            {ticks.map((tick, tickIndex) => {
              const value = maxValue * tick
              return (
                <g key={tick}>
                  <line
                    x1={left}
                    x2={viewWidth - right}
                    y1={y(value)}
                    y2={y(value)}
                    stroke="var(--color-border)"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x={left - 10}
                    y={y(value) + 4}
                    textAnchor="end"
                    fontSize={AXIS_FONT_SIZE}
                    fill="var(--color-text-muted)"
                  >
                    {tickLabels[tickIndex]}
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
                fontSize={AXIS_FONT_SIZE}
                fill="var(--color-text-secondary)"
                visibility={visibleLabelIndexes.has(index) ? undefined : 'hidden'}
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
        </>
      )}
    </div>
  )
}
