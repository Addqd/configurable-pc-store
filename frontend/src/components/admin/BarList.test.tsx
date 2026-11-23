import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { BarList, type BarItem } from './BarList'
import { estimateTextWidth, truncateText } from '../../admin/useElementWidth'
import { hoverChart, stubChartSizing } from '../../test-utils'

const items: BarItem[] = [
  { key: 13, label: 'AMD Ryzen 5 7600', value: 124 },
  { key: 20, label: 'AMD Ryzen 7 5700X', value: 103 },
  { key: 7, label: 'MSI RTX 4070 SUPER', value: 86 },
  { key: 8, label: 'GeForce RTX 4070 12 ГБ', value: 68 },
  { key: 1, label: 'Игровой ПК PowerPlay', value: 37 },
]

const axisLabels: [string, string, string] = ['0 шт.', '80 шт.', '160 шт.']

const barPaths = (container: HTMLElement) => [...container.querySelectorAll('.recharts-bar-rectangle path')]
/** Left and right edge of a bar, taken from its rectangle path. */
const barWidths = (container: HTMLElement) =>
  barPaths(container).map((path) => {
    const points = [...(path.getAttribute('d') ?? '').matchAll(/[ML]\s*(-?[\d.]+),(-?[\d.]+)/g)]
    const xs = points.map((match) => Number(match[1]))
    return xs.length === 0 ? 0 : Math.max(...xs) - Math.min(...xs)
  })
const valueLabels = (container: HTMLElement) =>
  [...container.querySelectorAll('.recharts-label-list text')].map((node) => node.textContent)
/** Left/right edge of every drawn bar; a zero-length bar renders no path. */
const barBoxes = (container: HTMLElement) =>
  [...container.querySelectorAll('.recharts-bar-rectangle')].flatMap((group) => {
    const path = group.querySelector('path')
    if (!path) return []
    const points = [...(path.getAttribute('d') ?? '').matchAll(/[ML]\s*(-?[\d.]+),(-?[\d.]+)/g)]
    const xs = points.map((match) => Number(match[1]))
    return [{
      left: xs.length ? Math.min(...xs) : 0,
      right: xs.length ? Math.max(...xs) : 0,
      width: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
    }]
  })
const labelNodes = (container: HTMLElement) =>
  [...container.querySelectorAll('.recharts-label-list text')] as SVGTextElement[]
const axisTickSlots = (container: HTMLElement, axis: 'xAxis' | 'yAxis') =>
  container.querySelectorAll(`.recharts-${axis} .recharts-cartesian-axis-tick`).length

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('BarList (Recharts horizontal bar chart)', () => {
  it('renders one horizontal bar per ranking row in the given order', () => {
    stubChartSizing(503)
    const { container } = render(
      <BarList items={items} max={160} axisLabels={axisLabels} legend="Товаров в заказах" ariaLabel="Лидеры продаж" />,
    )
    expect(barPaths(container)).toHaveLength(5)
    expect(axisTickSlots(container, 'yAxis')).toBe(5)
    // Ranking order: bar length shrinks with the value.
    const widths = barWidths(container)
    expect(widths).toEqual([...widths].sort((a, b) => b - a))
    expect(container.querySelector('.sr-only')?.textContent).toContain('AMD Ryzen 5 7600: 124, AMD Ryzen 7 5700X: 103')
  })

  it('paints every bar with the same approved blue', () => {
    stubChartSizing(503)
    const { container } = render(
      <BarList items={items} max={160} axisLabels={axisLabels} legend="Товаров в заказах" ariaLabel="Лидеры продаж" />,
    )
    const fills = barPaths(container).map((path) => path.getAttribute('fill'))
    expect(fills).toEqual(Array.from({ length: 5 }, () => '#2563eb'))
  })

  it('shows the exact sold-unit count on every bar', () => {
    stubChartSizing(503)
    const { container } = render(
      <BarList items={items} max={160} axisLabels={axisLabels} legend="Товаров в заказах" ariaLabel="Лидеры продаж" />,
    )
    expect(valueLabels(container)).toEqual(['124', '103', '86', '68', '37'])
  })

  it('keeps the value labels localized', () => {
    stubChartSizing(503)
    const { container } = render(
      <BarList
        items={[
          { key: 1, label: 'AMD Ryzen 5 7600', value: 12480 },
          { key: 2, label: 'RTX 4070 SUPER', value: 4.9 },
        ]}
        max={12500}
        axisLabels={['0', '6 тыс.', '12 тыс.']}
        legend="Товаров в заказах"
        formatValue={(value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)}
        ariaLabel="Лидеры продаж"
      />,
    )
    expect(valueLabels(container)).toEqual(['12 480', '4,9'])
  })

  it('reports a zero value without lengthening its bar', () => {
    stubChartSizing(503)
    const zeroItems: BarItem[] = [
      { key: 1, label: 'AMD Ryzen 5 7600', value: 124 },
      { key: 2, label: 'Intel Core i5-14600KF', value: 0 },
    ]
    const { container } = render(
      <BarList items={zeroItems} max={160} axisLabels={axisLabels} legend="Товаров в заказах" ariaLabel="Лидеры продаж" />,
    )
    expect(valueLabels(container)).toEqual(['124', '0'])
    // Recharts paints no rectangle for a zero-length bar, so the row keeps only
    // its track and its "0" label - the length is never inflated to fake a bar.
    expect(barPaths(container)).toHaveLength(1)
    expect(container.querySelectorAll('.recharts-bar-background-rectangle')).toHaveLength(2)
  })

  it('keeps a tiny positive value readable inside an inflated bar', () => {
    stubChartSizing(503)
    // 1 unit out of 160 would be a 2px sliver: the drawn bar grows to the label
    // width while the value itself, the axis and the tooltip stay untouched.
    const { container } = render(
      <BarList
        items={[{ key: 1, label: 'AMD Ryzen 5 7600', value: 1 }]}
        max={160}
        axisLabels={axisLabels}
        legend="Товаров в заказах"
        ariaLabel="Лидеры продаж"
      />,
    )
    const needed = estimateTextWidth('1', 11) + 16
    expect(barBoxes(container)[0].width).toBeGreaterThanOrEqual(needed)
    expect(barWidths(container)[0]).toBeGreaterThanOrEqual(needed)

    const label = labelNodes(container)[0]
    const bar = barBoxes(container)[0]
    expect(label.textContent).toBe('1')
    // Inside: right-anchored at the bar end with the shared 8px padding.
    expect(label.getAttribute('text-anchor')).toBe('end')
    expect(Number(label.getAttribute('x'))).toBeCloseTo(bar.right - 8)
    expect(Number(label.getAttribute('x'))).toBeGreaterThan(bar.left)
    expect(container.querySelector('.sr-only')?.textContent).toContain('AMD Ryzen 5 7600: 1')
  })

  it('widens a bar enough for a long formatted label', () => {
    stubChartSizing(503)
    const { container } = render(
      <BarList
        items={[{ key: 1, label: 'AMD Ryzen 5 7600', value: 2 }]}
        max={160}
        axisLabels={['0 шт.', '80 шт.', '160 шт.']}
        legend="Товаров в заказах"
        formatValue={(value) => `${new Intl.NumberFormat('ru-RU').format(value)} шт.`}
        ariaLabel="Лидеры продаж"
      />,
    )
    const label = labelNodes(container)[0]
    const text = label.textContent ?? ''
    const needed = estimateTextWidth(text, 11) + 16
    expect(text).toBe('2 шт.')
    expect(barBoxes(container)[0].width).toBeGreaterThanOrEqual(needed)
    // The label still ends inside the bar, not clipped at its edge.
    expect(Number(label.getAttribute('x'))).toBeCloseTo(barBoxes(container)[0].right - 8)
  })

  it('draws every positive label with one identical white style', () => {
    stubChartSizing(503)
    const mixed: BarItem[] = [
      { key: 1, label: 'AMD Ryzen 5 7600', value: 124 },
      { key: 2, label: 'AMD Ryzen 7 5700X', value: 3 },
      { key: 3, label: 'MSI RTX 4070 SUPER', value: 1 },
    ]
    const { container } = render(
      <BarList items={mixed} max={160} axisLabels={axisLabels} legend="Товаров в заказах" ariaLabel="Лидеры продаж" />,
    )
    const labels = labelNodes(container)
    expect(labels.map((node) => node.textContent)).toEqual(['124', '3', '1'])
    for (const label of labels) {
      expect(label.getAttribute('fill')).toBe('#ffffff')
      expect(label.getAttribute('text-anchor')).toBe('end')
      expect(label.getAttribute('font-weight')).toBe('600')
      expect(label.getAttribute('font-size')).toBe('11')
      expect(label.getAttribute('dominant-baseline')).toBe('central')
    }
    // A small value never falls back to the grey label outside the bar.
    expect(labels.every((label) => label.getAttribute('fill') === '#ffffff')).toBe(true)
  })

  it('keeps a zero row honest: no bar and the label outside the track', () => {
    stubChartSizing(503)
    const { container } = render(
      <BarList
        items={[
          { key: 1, label: 'AMD Ryzen 5 7600', value: 124 },
          { key: 2, label: 'Intel Core i5-14600KF', value: 0 },
        ]}
        max={160}
        axisLabels={axisLabels}
        legend="Товаров в заказах"
        ariaLabel="Лидеры продаж"
      />,
    )
    const zeroLabel = labelNodes(container)[1]
    expect(zeroLabel.textContent).toBe('0')
    expect(zeroLabel.getAttribute('fill')).toBe('var(--color-text-secondary)')
    expect(zeroLabel.getAttribute('text-anchor')).toBe('start')
    // Recharts paints no rectangle for a zero-length bar: the track stays empty.
    expect(barBoxes(container)).toHaveLength(1)
    expect(container.querySelectorAll('.recharts-bar-background-rectangle')).toHaveLength(2)
  })

  it('keeps labels inside the bars at a narrow width', () => {
    stubChartSizing(320)
    const { container } = render(
      <BarList
        items={[
          { key: 1, label: 'AMD Ryzen 5 7600', value: 1 },
          { key: 2, label: 'AMD Ryzen 7 5700X', value: 160 },
        ]}
        max={160}
        axisLabels={axisLabels}
        legend="Товаров в заказах"
        ariaLabel="Лидеры продаж"
      />,
    )
    const boxes = barBoxes(container)
    const labels = labelNodes(container)
    for (const [index, label] of labels.entries()) {
      const box = boxes[index]
      const x = Number(label.getAttribute('x'))
      expect(x).toBeLessThanOrEqual(box.right)
      expect(x).toBeGreaterThanOrEqual(box.left)
    }
  })

  it('keeps the reference axis scale and legend', () => {
    stubChartSizing(503)
    const { container } = render(
      <BarList items={items} max={160} axisLabels={axisLabels} legend="Товаров в заказах" ariaLabel="Лидеры продаж" />,
    )
    // Three ticks: zero, the middle of the nice axis maximum and the maximum itself.
    expect(axisTickSlots(container, 'xAxis')).toBe(3)
    expect(container.textContent).toContain('Товаров в заказах')
  })

  it('keeps the full product name in the tooltip while the axis label is shortened', async () => {
    stubChartSizing(503)
    const longName = 'ASUS GeForce RTX 4070 Ti SUPER TUF Gaming 16G'
    const { container } = render(
      <BarList items={[{ key: 9, label: longName, value: 30 }]} max={160} axisLabels={axisLabels} legend="Товаров в заказах" ariaLabel="Лидеры продаж" />,
    )
    hoverChart(container, 300, 18)
    await waitFor(() => expect(container.querySelector('.recharts-default-tooltip')?.textContent ?? '').not.toBe(''))
    expect(container.querySelector('.recharts-default-tooltip')?.textContent).toContain(longName)
  })

  it('shortens names that do not fit the label column', () => {
    // Pure formatting rule used by the category axis: full text stays available in
    // the tooltip and in the `<title>` of the rendered tick.
    expect(truncateText('AMD Ryzen 5 7600', 200, 12)).toBe('AMD Ryzen 5 7600')
    const shortened = truncateText('ASUS GeForce RTX 4070 Ti SUPER TUF Gaming 16G', 120, 12)
    expect(shortened.endsWith('…')).toBe(true)
    expect(shortened.length).toBeLessThan(24)
  })

  it('shows the product and its formatted value in the tooltip', async () => {
    stubChartSizing(503)
    const { container } = render(
      <BarList items={items} max={160} axisLabels={axisLabels} legend="Товаров в заказах" ariaLabel="Лидеры продаж" />,
    )
    hoverChart(container, 300, 18)
    await waitFor(() => expect(container.querySelector('.recharts-default-tooltip')?.textContent ?? '').not.toBe(''))
    const text = container.querySelector('.recharts-default-tooltip')?.textContent ?? ''
    expect(text).toContain('AMD Ryzen 5 7600')
    expect(text).toContain('124')
  })

  it('renders the empty state instead of a chart', () => {
    stubChartSizing(503)
    const { container } = render(
      <BarList items={[]} max={160} axisLabels={axisLabels} legend="Товаров в заказах" ariaLabel="Лидеры продаж" />,
    )
    expect(container.querySelector('.recharts-wrapper')).toBeNull()
    expect(container.textContent).toContain('Недостаточно данных для графика')
  })

  it('exposes the ranking as text for assistive technology', () => {
    stubChartSizing(503)
    const { container } = render(
      <BarList items={items} max={160} axisLabels={axisLabels} legend="Товаров в заказах" ariaLabel="Лидеры продаж" />,
    )
    expect(container.querySelector('.sr-only')?.textContent).toContain('AMD Ryzen 5 7600: 124')
  })
})
