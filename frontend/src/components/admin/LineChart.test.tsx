import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LineChart, type ChartSeries } from './LineChart'

const makeSeries = (count: number): ChartSeries[] => [{
  name: 'Все товары',
  color: '#2563eb',
  points: Array.from({ length: count }, (_, index) => ({ label: `М${index}`, value: index * 10 })),
}]

const xLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('svg text[text-anchor="middle"]'))
const visibleXLabels = (container: HTMLElement) =>
  xLabels(container).filter((node) => node.getAttribute('visibility') !== 'hidden')
const viewBoxWidth = (container: HTMLElement) =>
  Number((container.querySelector('svg')?.getAttribute('viewBox') ?? '').split(' ')[2])

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

  it('renders an empty state without a series', () => {
    const { container } = render(<LineChart series={[]} ariaLabel="Динамика" />)
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('LineChart responsive geometry', () => {
  it('keeps the desktop 720-unit coordinate system when the container is wide', () => {
    stubContainerWidth(1080)
    const { container } = render(<LineChart series={makeSeries(6)} ariaLabel="Динамика" height={280} />)
    expect(viewBoxWidth(container)).toBe(720)
    // Axis text keeps its original size, which the wide container scales up.
    for (const label of visibleXLabels(container)) expect(label.getAttribute('font-size')).toBe('11')
  })

  it('renders narrow containers 1:1 instead of shrinking the whole drawing', () => {
    stubContainerWidth(320)
    const { container } = render(<LineChart series={makeSeries(6)} ariaLabel="Динамика" height={280} />)
    // A 320-unit viewBox drawn into a 320px container keeps text at its native 11px.
    expect(viewBoxWidth(container)).toBe(320)
    for (const label of visibleXLabels(container)) expect(label.getAttribute('font-size')).toBe('11')
    // Every data point survives the narrower coordinate system.
    expect(container.querySelectorAll('circle')).toHaveLength(6)
  })

  it('keeps narrow-screen labels readable, unclipped and non-overlapping', () => {
    stubContainerWidth(320)
    const { container } = render(<LineChart series={makeSeries(12)} ariaLabel="Динамика" height={280} />)
    const width = viewBoxWidth(container)
    const visible = visibleXLabels(container)
    expect(visible.length).toBeGreaterThanOrEqual(2)
    expect(visible.length).toBeLessThanOrEqual(4)

    const positions = visible.map((node) => Number(node.getAttribute('x')))
    for (const [index, x] of positions.entries()) {
      // No label is clipped by the chart edges.
      expect(x).toBeGreaterThanOrEqual(56)
      expect(x).toBeLessThanOrEqual(width - 16)
      // Neighbouring labels keep more than one label width of distance.
      if (index > 0) expect(x - (positions[index - 1] ?? 0)).toBeGreaterThanOrEqual(60)
    }

    // Y-axis values stay inside the left margin instead of being cut off.
    const yLabels = Array.from(container.querySelectorAll('svg text[text-anchor="end"]'))
    expect(yLabels).toHaveLength(5)
    for (const label of yLabels) {
      expect(Number(label.getAttribute('x'))).toBeGreaterThan(0)
      expect(label.getAttribute('font-size')).toBe('11')
    }
  })

  it('falls back to the desktop geometry without a ResizeObserver', () => {
    const { container } = render(<LineChart series={makeSeries(6)} ariaLabel="Динамика" height={280} />)
    expect(viewBoxWidth(container)).toBe(720)
  })
})
