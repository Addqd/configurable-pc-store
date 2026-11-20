import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { LineChart, type ChartSeries } from './LineChart'
import { hoverChart, stubChartSizing } from '../../test-utils'

const MONTHS = ['Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя']

const makeSeries = (
  values: number[],
  name = 'Все товары',
  color = '#2563eb',
  labels = MONTHS,
): ChartSeries[] => [{
  name,
  color,
  points: values.map((value, index) => ({ label: labels[index] ?? `М${index}`, value })),
}]

const lineCurves = (container: HTMLElement) => container.querySelectorAll('.recharts-line-curve')
const dots = (container: HTMLElement) => container.querySelectorAll('.recharts-line-dot')
const axisTicks = (container: HTMLElement) => container.querySelectorAll('.recharts-cartesian-axis-tick')
const tooltipText = (container: HTMLElement) =>
  container.querySelector('.recharts-default-tooltip')?.textContent ?? ''

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LineChart (Recharts)', () => {
  it('renders one Recharts line per series with a dot for every data point', () => {
    stubChartSizing(720)
    const { container } = render(
      <LineChart series={makeSeries([95, 115, 130, 145, 160, 148])} ariaLabel="Динамика продаж" />,
    )
    expect(lineCurves(container)).toHaveLength(1)
    expect(dots(container)).toHaveLength(6)
    expect(container.querySelector('.recharts-cartesian-grid')).not.toBeNull()
  })

  it('renders both value and month axes for the whole period', () => {
    stubChartSizing(720)
    const { container } = render(
      <LineChart
        series={makeSeries([95, 115, 130, 145, 160, 148])}
        formatValue={(value) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`}
        ariaLabel="Динамика продаж"
      />,
    )
    // Five value ticks (one per grid line) plus one tick per month. The tick text
    // itself is drawn by Recharts' measured text layer, which jsdom cannot lay out.
    expect(axisTicks(container)).toHaveLength(11)
    expect(container.querySelectorAll('.recharts-cartesian-grid-horizontal line')).toHaveLength(5)
  })

  it('keeps every point of a long period even when axis labels are sampled', () => {
    stubChartSizing(320)
    const labels = Array.from({ length: 12 }, (_, index) => `М${index}`)
    const { container } = render(
      <LineChart series={makeSeries(Array.from({ length: 12 }, (_, index) => index * 5), 'Все товары', '#2563eb', labels)} ariaLabel="Динамика" />,
    )
    expect(dots(container)).toHaveLength(12)
  })

  it('draws each comparison series separately with its own colour and name', () => {
    stubChartSizing(720)
    const first = makeSeries([10, 20, 30, 40, 50, 60], 'Ryzen 5 7600', '#2563eb')
    const second = makeSeries([6, 9, 12, 15, 18, 21], 'RTX 4070 SUPER', '#8b5cf6')
    const { container } = render(<LineChart series={[first[0], second[0]]} ariaLabel="Сравнение" />)

    expect(lineCurves(container)).toHaveLength(2)
    const strokes = [...lineCurves(container)].map((node) => node.getAttribute('stroke'))
    expect(strokes).toEqual(['#2563eb', '#8b5cf6'])
    expect(container.textContent).toContain('Ryzen 5 7600')
    expect(container.textContent).toContain('RTX 4070 SUPER')
    expect(dots(container)).toHaveLength(12)
  })

  it('shows the month and the formatted value in the tooltip', async () => {
    stubChartSizing(720)
    const { container } = render(
      <LineChart
        series={makeSeries([95, 115, 130, 145, 160, 148])}
        formatValue={(value) => `${new Intl.NumberFormat('ru-RU').format(value)} шт.`}
        ariaLabel="Динамика продаж"
      />,
    )
    // The pointer is moved onto the third month of a 720-unit reference chart.
    hoverChart(container, 300, 100)
    await waitFor(() => expect(tooltipText(container)).toContain('Авг'))
    const text = tooltipText(container)
    expect(text).toContain('130 шт.')
    expect(text).toContain('Все товары')
  })

  it('renders the empty state without a chart', () => {
    stubChartSizing(720)
    const { container } = render(<LineChart series={[]} ariaLabel="Динамика" />)
    expect(container.querySelector('.recharts-wrapper')).toBeNull()
    expect(container.textContent).toContain('Недостаточно данных для графика')
  })

  it('draws narrow containers 1:1 instead of shrinking the axis text', () => {
    stubChartSizing(360)
    const { container } = render(<LineChart series={makeSeries([1, 2, 3, 4, 5, 6])} height={280} ariaLabel="Динамика" />)
    const surface = container.querySelector('.recharts-surface')
    // The 280px reference height stays 280px plus the 24px legend row, and the
    // data points keep their 3.5px reference radius.
    expect(Number(surface?.getAttribute('height'))).toBe(304)
    expect(dots(container)[0]?.getAttribute('r')).toBe('3.5')
  })

  it('grows the drawing together with a wide container', async () => {
    stubChartSizing(1080)
    const { container } = render(<LineChart series={makeSeries([1, 2, 3, 4, 5, 6])} height={280} ariaLabel="Динамика" />)
    const surface = () => container.querySelector('.recharts-surface')
    // 1080 / 720 = 1.5, so the drawing grows to 420px of plot plus the legend and
    // the axis text and line grow with it, exactly like the approved rendering.
    await waitFor(() => expect(Number(surface()?.getAttribute('height'))).toBe(444))
    expect(Number(dots(container)[0]?.getAttribute('r'))).toBeCloseTo(5.25)
  })

  it('names the chart for assistive technology', () => {
    stubChartSizing(720)
    const { container } = render(<LineChart series={makeSeries([1, 2, 3, 4, 5, 6])} ariaLabel="Динамика продаж" />)
    expect(container.querySelector('svg title')?.textContent).toBe('Динамика продаж')
  })
})
