import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { LineChart, type ChartSeries } from './LineChart'
import { hoverChart, stubChartSizing } from '../../test-utils'
import i18n from '../../i18n'
import { formatCompactNumber, formatMoney, formatNumber } from '../../admin/params'

const MONTHS = ['Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя']

/** `Intl` groups digits with non-breaking spaces; compare on a readable form. */
const norm = (value: string) => value.replace(/\u00a0|\u202f/g, ' ')

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
/** Number of drawn segments of a line: one per gap between two data points. */
const segmentsOf = (path: Element | undefined) =>
  (path?.getAttribute('d') ?? '').match(/L/g)?.length ?? 0

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await act(async () => { await i18n.changeLanguage('ru') })
})

describe('LineChart (Recharts)', () => {
  it('renders one Recharts line per series with a marker for every nonzero point', () => {
    stubChartSizing(720)
    const { container } = render(
      <LineChart series={makeSeries([95, 115, 130, 145, 160, 148])} ariaLabel="Динамика продаж" />,
    )
    expect(lineCurves(container)).toHaveLength(1)
    expect(dots(container)).toHaveLength(6)
    expect(container.querySelector('.recharts-cartesian-grid')).not.toBeNull()
  })

  it('marks only the points that actually sold something but draws the whole line', () => {
    stubChartSizing(720)
    const { container } = render(
      <LineChart series={makeSeries([0, 3, 0, 7, 0, 2])} ariaLabel="Динамика продаж" />,
    )
    // Three of the six buckets are zero: they get no permanent marker.
    expect(dots(container)).toHaveLength(3)
    expect([...dots(container)].map((dot) => dot.getAttribute('fill'))).toEqual([
      '#2563eb', '#2563eb', '#2563eb',
    ])
    // The line still passes through every bucket, zeros included.
    expect(segmentsOf(lineCurves(container)[0])).toBe(5)
  })

  it('keeps a zero date in the data and reports it in the tooltip', async () => {
    stubChartSizing(720)
    const { container } = render(
      <LineChart
        series={makeSeries([95, 115, 0, 145, 160, 148])}
        formatValue={(value) => `${formatNumber(value)} шт.`}
        ariaLabel="Динамика продаж"
      />,
    )
    // One zero bucket among six points: five markers, six points on the line.
    expect(dots(container)).toHaveLength(5)
    expect(segmentsOf(lineCurves(container)[0])).toBe(5)

    hoverChart(container, 300, 100)
    await waitFor(() => expect(tooltipText(container)).toContain('Авг'))
    expect(norm(tooltipText(container))).toContain('0 шт.')
  })

  it('keeps a yearly axis readable and shows the exact value of a year', async () => {
    stubChartSizing(720)
    const years = ['2011', '2012', '2013', '2014', '2015', '2016']
    const { container } = render(
      <LineChart
        series={makeSeries([0, 3, 130, 0, 160, 0], 'Все товары', '#2563eb', years)}
        formatValue={(value) => `${formatNumber(value)} шт.`}
        ariaLabel="Динамика продаж"
      />,
    )
    // Year labels identify the coarse axis; each one is its own tick.
    const texts = [...container.querySelectorAll('svg text')].map((node) => node.textContent)
    for (const year of years) expect(texts).toContain(year)
    expect(dots(container)).toHaveLength(3)

    hoverChart(container, 300, 100)
    await waitFor(() => expect(tooltipText(container)).toContain('2013'))
    expect(norm(tooltipText(container))).toContain('130 шт.')
  })

  it('keeps compared series aligned while hiding their zero markers', async () => {
    stubChartSizing(720)
    const first = makeSeries([10, 0, 30, 0, 50, 60], 'Ryzen 5 7600', '#2563eb')
    const second = makeSeries([0, 9, 12, 0, 18, 21], 'RTX 4070 SUPER', '#8b5cf6')
    const { container } = render(
      <LineChart
        series={[first[0], second[0]]}
        formatValue={(value) => formatNumber(value)}
        ariaLabel="Сравнение"
      />,
    )

    const curves = lineCurves(container)
    expect(curves).toHaveLength(2)
    // Both series keep all six points on their line, on one shared x axis.
    expect([...curves].map((curve) => segmentsOf(curve))).toEqual([5, 5])
    // Four non-zero values per series, each marker in its own series colour.
    const fills = [...dots(container)].map((dot) => dot.getAttribute('fill'))
    expect(fills.filter((fill) => fill === '#2563eb')).toHaveLength(4)
    expect(fills.filter((fill) => fill === '#8b5cf6')).toHaveLength(4)

    hoverChart(container, 300, 100)
    await waitFor(() => expect(tooltipText(container)).toContain('Ryzen 5 7600'))
    const text = norm(tooltipText(container))
    expect(text).toMatch(/Ryzen 5 7600\s*:\s*30/)
    expect(text).toMatch(/RTX 4070 SUPER\s*:\s*12/)
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
      <LineChart series={makeSeries(Array.from({ length: 12 }, (_, index) => index * 5 + 1), 'Все товары', '#2563eb', labels)} ariaLabel="Динамика" />,
    )
    expect(dots(container)).toHaveLength(12)
    expect(segmentsOf(lineCurves(container)[0])).toBe(11)
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

  it('shows the exact amount in the tooltip while the axis keeps its compact labels', async () => {
    stubChartSizing(720)
    const amounts = [2180000, 2640000, 3120000, 3640000, 4720000, 4380000]
    const compactAxis = (value: number) => `${formatCompactNumber(value)} ₽`
    const exactTooltip = (value: number) => formatMoney(value)
    const { container } = render(
      <LineChart
        series={makeSeries(amounts)}
        formatValue={compactAxis}
        formatTooltipValue={exactTooltip}
        ariaLabel="Динамика продаж"
      />,
    )
    // The axis formatter must never reach the tooltip: it rounds 3 120 000 to «3,1 млн».
    expect(compactAxis(3120000)).not.toBe(exactTooltip(3120000))

    hoverChart(container, 300, 100)
    await waitFor(() => expect(tooltipText(container)).toContain('Авг'))
    const text = norm(tooltipText(container))
    expect(text).toContain('3 120 000 ₽')
    expect(text).not.toContain('млн')
  })

  it('localizes the exact tooltip value in Russian and English', async () => {
    stubChartSizing(720)
    const amounts = [2180000, 2640000, 3120000, 3640000, 4720000, 4380000]
    const { container } = render(
      <LineChart
        series={makeSeries(amounts)}
        formatValue={(value) => `${formatCompactNumber(value)} ₽`}
        formatTooltipValue={formatMoney}
        ariaLabel="Динамика продаж"
      />,
    )

    hoverChart(container, 300, 100)
    await waitFor(() => expect(norm(tooltipText(container))).toContain('3 120 000 ₽'))

    await act(async () => { await i18n.changeLanguage('en') })
    await waitFor(() => expect(norm(tooltipText(container))).toContain('3,120,000 ₽'))
  })

  it('keeps unit counts exact in the tooltip and identifies every comparison series', async () => {
    stubChartSizing(720)
    const first = makeSeries([10, 20, 30, 40, 50, 60], 'Ryzen 5 7600', '#2563eb')
    const second = makeSeries([6, 9, 12, 15, 18, 21], 'RTX 4070 SUPER', '#8b5cf6')
    const { container } = render(
      <LineChart
        series={[first[0], second[0]]}
        formatValue={(value) => formatNumber(value)}
        formatTooltipValue={(value) => formatNumber(value)}
        ariaLabel="Сравнение"
      />,
    )

    hoverChart(container, 300, 100)
    await waitFor(() => expect(tooltipText(container)).toContain('Ryzen 5 7600'))
    const text = norm(tooltipText(container))
    // Every series keeps its identity and its own exact value.
    expect(text).toMatch(/Ryzen 5 7600\s*:\s*30/)
    expect(text).toMatch(/RTX 4070 SUPER\s*:\s*12/)
  })

  it('falls back to the axis formatter when no tooltip formatter is given', async () => {
    stubChartSizing(720)
    const { container } = render(
      <LineChart
        series={makeSeries([95, 115, 130, 145, 160, 148])}
        formatValue={(value) => `${formatNumber(value)} шт.`}
        ariaLabel="Динамика продаж"
      />,
    )
    hoverChart(container, 300, 100)
    await waitFor(() => expect(norm(tooltipText(container))).toContain('130 шт.'))
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
