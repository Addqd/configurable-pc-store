import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { RatingDistributionChart } from './RatingDistribution'
import { stubChartSizing } from '../../test-utils'

const distribution = [
  { rating: 5, count: 54 },
  { rating: 4, count: 7 },
  { rating: 3, count: 6 },
  { rating: 2, count: 3 },
  { rating: 1, count: 2 },
]

const barPaths = (container: HTMLElement) => [...container.querySelectorAll('.recharts-bar-rectangle path')]
const axisTickSlots = (container: HTMLElement) =>
  container.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick').length
const countLabels = (container: HTMLElement) =>
  [...container.querySelectorAll('.recharts-label-list text')].map((node) => node.textContent)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('RatingDistributionChart (Recharts)', () => {
  it('renders the five rating buckets from five stars down to one', () => {
    stubChartSizing(760)
    const { container } = render(<RatingDistributionChart distribution={distribution} categoryLabel="Статистика отзывов" />)
    // One category tick per star rating, one bar per bucket, in descending order.
    expect(axisTickSlots(container)).toBe(5)
    expect(barPaths(container)).toHaveLength(5)
    const rows = [...container.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick')]
    expect(rows).toHaveLength(5)
  })

  it('keeps the golden star-rating bars', () => {
    stubChartSizing(760)
    const { container } = render(<RatingDistributionChart distribution={distribution} categoryLabel="Статистика отзывов" />)
    expect(barPaths(container).map((path) => path.getAttribute('fill'))).toEqual(Array.from({ length: 5 }, () => '#fbbf24'))
  })

  it('shows every review count exactly once', () => {
    stubChartSizing(760)
    const { container } = render(<RatingDistributionChart distribution={distribution} categoryLabel="Статистика отзывов" />)
    expect(countLabels(container)).toEqual(['54', '7', '6', '3', '2'])
    // No duplicated numbers elsewhere in the section.
    expect(container.textContent?.split('54')).toHaveLength(2)
  })

  it('keeps a zero bucket readable without inventing a bar length', () => {
    stubChartSizing(760)
    const { container } = render(
      <RatingDistributionChart
        distribution={distribution.map((bucket) => (bucket.rating === 3 ? { ...bucket, count: 0 } : bucket))}
        categoryLabel="Статистика отзывов"
      />,
    )
    expect(countLabels(container)).toEqual(['54', '7', '0', '3', '2'])
  })

  it('falls back to an empty scale when every bucket is empty', () => {
    stubChartSizing(760)
    const { container } = render(
      <RatingDistributionChart
        distribution={distribution.map((bucket) => ({ ...bucket, count: 0 }))}
        categoryLabel="Статистика отзывов"
      />,
    )
    expect(countLabels(container)).toEqual(['0', '0', '0', '0', '0'])
    // Empty buckets keep their track and the five rows, without any painted bar.
    expect(barPaths(container)).toHaveLength(0)
    expect(container.querySelectorAll('.recharts-bar-background-rectangle')).toHaveLength(5)
  })
})
