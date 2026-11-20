import { afterEach, describe, expect, it } from 'vitest'
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

afterEach(cleanup)

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
