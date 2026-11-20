import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LineChart, type ChartSeries } from './LineChart'

const makeSeries = (count: number, label = (index: number) => `М${index}`): ChartSeries[] => [{
  name: 'Все товары',
  color: '#2563eb',
  points: Array.from({ length: count }, (_, index) => ({ label: label(index), value: index * 10 })),
}]

const xLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('svg text[text-anchor="middle"]'))
const visibleXLabels = (container: HTMLElement) =>
  xLabels(container).filter((node) => node.getAttribute('visibility') !== 'hidden')
const yLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('svg text[text-anchor="end"]'))
const viewBoxWidth = (container: HTMLElement) =>
  Number((container.querySelector('svg')?.getAttribute('viewBox') ?? '').split(' ')[2])

/**
 * Independent width estimate for axis text: the browser measures real glyphs, so
 * these assertions use a deliberately generous 11px-font approximation.
 */
const estimateWidth = (node: Element) => (node.textContent ?? '').length * 7

/** Reports a fixed container width, like a real ResizeObserver would. */
function stubContainerWidth(width: number) {
  class FakeResizeObserver {
    readonly callback: (entries: { contentRect: { width: number } }[]) => void

    constructor(callback: (entries: { contentRect: { width: number } }[]) => void) {
      this.callback = callback
    }

    observe() {
      this.callback([{ contentRect: { width } }])
    }

    unobserve() {}

    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LineChart axis labels', () => {
  it('samples x-axis labels for long periods but keeps every data point', () => {
    const { container } = render(<LineChart series={makeSeries(24)} ariaLabel="Динамика" height={280} />)
    const visible = visibleXLabels(container)
    expect(xLabels(container)).toHaveLength(24)
    expect(visible.length).toBeLessThan(24)
    expect(visible.length).toBeGreaterThanOrEqual(2)
    // Data points are never hidden to reduce label density.
    expect(container.querySelectorAll('circle')).toHaveLength(24)
  })

  it('keeps every label for short periods', () => {
    const { container } = render(<LineChart series={makeSeries(6)} ariaLabel="Динамика" height={280} />)
    expect(visibleXLabels(container)).toHaveLength(6)
    expect(container.querySelectorAll('circle')).toHaveLength(6)
  })

  it('never places two visible labels closer than one label width', () => {
    const { container } = render(
      <LineChart series={makeSeries(12, (index) => `Сентябрь ${index}`)} ariaLabel="Динамика" height={280} />,
    )
    const visible = visibleXLabels(container)
    expect(visible.length).toBeGreaterThanOrEqual(2)
    for (const [index, label] of visible.entries()) {
      if (index === 0) continue
      const previous = visible[index - 1] as Element
      const distance = Number(label.getAttribute('x')) - Number(previous.getAttribute('x'))
      expect(distance).toBeGreaterThanOrEqual((estimateWidth(label) + estimateWidth(previous)) / 2)
    }
  })

  it('renders an empty state without a series', () => {
    const { container } = render(<LineChart series={[]} ariaLabel="Динамика" />)
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('LineChart responsive geometry', () => {
  it('keeps the desktop 720-unit coordinate system and margins when the container is wide', () => {
    stubContainerWidth(1080)
    const { container } = render(<LineChart series={makeSeries(6)} ariaLabel="Динамика" height={280} />)
    expect(viewBoxWidth(container)).toBe(720)
    // Axis text keeps its original size, which the wide container scales up.
    for (const label of visibleXLabels(container)) expect(label.getAttribute('font-size')).toBe('11')
    // The desktop left margin is untouched: y-axis text sits at 56 - 10.
    for (const label of yLabels(container)) expect(Number(label.getAttribute('x'))).toBe(46)
    expect(visibleXLabels(container)).toHaveLength(6)
  })

  it('reserves room for a long final label on the desktop geometry', () => {
    stubContainerWidth(1080)
    const { container } = render(
      <LineChart series={makeSeries(12, (index) => `Ноябрь 202${index % 2}`)} ariaLabel="Динамика" height={280} />,
    )
    const width = viewBoxWidth(container)
    expect(width).toBe(720)
    for (const label of visibleXLabels(container)) {
      const x = Number(label.getAttribute('x'))
      expect(x - estimateWidth(label) / 2).toBeGreaterThanOrEqual(0)
      expect(x + estimateWidth(label) / 2).toBeLessThanOrEqual(width)
    }
  })

  it('draws narrow containers 1:1 instead of shrinking the whole drawing', () => {
    for (const width of [248, 320, 375]) {
      stubContainerWidth(width)
      const { container, unmount } = render(<LineChart series={makeSeries(6)} ariaLabel="Динамика" height={280} />)
      expect(viewBoxWidth(container)).toBe(width)
      for (const label of visibleXLabels(container)) expect(label.getAttribute('font-size')).toBe('11')
      expect(container.querySelectorAll('circle')).toHaveLength(6)
      unmount()
      vi.unstubAllGlobals()
    }
  })

  it('keeps narrow-screen labels readable, unclipped and non-overlapping at 248px', () => {
    stubContainerWidth(248)
    const { container } = render(<LineChart series={makeSeries(12)} ariaLabel="Динамика" height={280} />)
    const width = viewBoxWidth(container)
    const visible = visibleXLabels(container)
    expect(visible.length).toBeGreaterThanOrEqual(2)

    const positions = visible.map((node) => Number(node.getAttribute('x')))
    for (const [index, x] of positions.entries()) {
      const label = visible[index] as Element
      // No label is clipped by the chart edges.
      expect(x - estimateWidth(label) / 2).toBeGreaterThanOrEqual(0)
      expect(x + estimateWidth(label) / 2).toBeLessThanOrEqual(width)
      if (index > 0) {
        const previous = visible[index - 1] as Element
        const distance = x - (positions[index - 1] ?? 0)
        expect(distance).toBeGreaterThanOrEqual((estimateWidth(label) + estimateWidth(previous)) / 2)
      }
    }

    // Y-axis values stay inside the left margin instead of being cut off.
    expect(yLabels(container)).toHaveLength(5)
    for (const label of yLabels(container)) {
      expect(Number(label.getAttribute('x')) - estimateWidth(label)).toBeGreaterThanOrEqual(0)
      expect(label.getAttribute('font-size')).toBe('11')
    }
    // Every data point survives the narrower coordinate system.
    expect(container.querySelectorAll('circle')).toHaveLength(12)
    expect(container.querySelectorAll('polyline')).toHaveLength(1)
  })

  it('reserves room for large formatted y-axis values on a narrow container', () => {
    stubContainerWidth(248)
    const { container } = render(
      <LineChart
        series={makeSeries(12, (index) => `Январь 202${index % 2}`)}
        formatValue={(value) => `${new Intl.NumberFormat('ru-RU').format(Math.round(value))} ₽`}
        ariaLabel="Динамика"
        height={280}
      />,
    )
    const width = viewBoxWidth(container)
    for (const label of yLabels(container)) {
      // `1 234 567 ₽` and friends must not be clipped by the left edge.
      expect(Number(label.getAttribute('x')) - estimateWidth(label)).toBeGreaterThanOrEqual(0)
    }
    for (const label of visibleXLabels(container)) {
      const x = Number(label.getAttribute('x'))
      expect(x - estimateWidth(label) / 2).toBeGreaterThanOrEqual(0)
      expect(x + estimateWidth(label) / 2).toBeLessThanOrEqual(width)
    }
    expect(container.querySelectorAll('circle')).toHaveLength(12)
  })

  it('falls back to the desktop geometry without a ResizeObserver', () => {
    const { container } = render(<LineChart series={makeSeries(6)} ariaLabel="Динамика" height={280} />)
    expect(viewBoxWidth(container)).toBe(720)
  })
})
