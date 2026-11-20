import type { ReactElement } from 'react'
import { fireEvent, render as rtlRender, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

interface RenderWithClientOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Existing cache, so a test can assert which entries were invalidated. */
  client?: QueryClient
}

export function render(ui: ReactElement, options?: RenderWithClientOptions) {
  const { client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }), ...rest } = options ?? {}
  return rtlRender(ui, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    ...rest,
  })
}

/** Unseeded client with retries disabled, for tests that inspect the cache. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

/** Original jsdom implementation, captured once so repeated stubs cannot recurse. */
const nativeGetBoundingClientRect = Element.prototype.getBoundingClientRect

/**
 * Deterministic geometry for charts rendered in jsdom.
 *
 * Recharts measures its container with `ResizeObserver` and reads
 * `getBoundingClientRect` when a pointer event is translated into a chart
 * coordinate. jsdom implements neither, so an unstubbed responsive chart renders
 * no SVG at all. The stubs only report a box; chart behaviour is left untouched.
 * `vi.unstubAllGlobals()` / `vi.restoreAllMocks()` in `afterEach` revert them.
 */
export function stubChartSizing(width = 720, fallbackHeight = 400) {
  const heightOf = (element: Element) => {
    const inline = Number.parseFloat((element as HTMLElement).style?.height ?? '')
    return Number.isFinite(inline) && inline > 0 ? inline : fallbackHeight
  }

  class FakeResizeObserver {
    private readonly callback: (entries: { contentRect: { width: number; height: number } }[]) => void

    constructor(callback: (entries: { contentRect: { width: number; height: number } }[]) => void) {
      this.callback = callback
    }

    observe(element: Element) {
      const report = () => this.callback([{ contentRect: { width, height: heightOf(element) } }])
      report()
      // A real ResizeObserver reports again after the element resizes; the chart
      // changes its own height when the measured width changes.
      setTimeout(report, 0)
    }

    unobserve() {}

    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  // Only the chart container reports a box. Every other element keeps the jsdom
  // behaviour (an empty box), which is what Recharts' own text measurement expects.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (!(this.getAttribute?.('class') ?? '').includes('recharts-wrapper')) return nativeGetBoundingClientRect.call(this)
    const height = heightOf(this)
    return {
      x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height,
      toJSON: () => ({}),
    } as DOMRect
  })
}

/** Moves the pointer to a chart coordinate, the way a real hover does. */
export function hoverChart(container: HTMLElement, offsetX: number, offsetY = 0) {
  const surface = container.querySelector('.recharts-wrapper')
  if (!surface) throw new Error('chart is not rendered')
  const box = surface.getBoundingClientRect()
  fireEvent.mouseEnter(surface, { clientX: box.left + offsetX, clientY: box.top + offsetY })
  fireEvent.mouseMove(surface, { clientX: box.left + offsetX, clientY: box.top + offsetY })
}
