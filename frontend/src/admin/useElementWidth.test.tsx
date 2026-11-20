import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useElementWidth } from './useElementWidth'

/** Controllable `ResizeObserver` double: records instances and lets the test emit sizes. */
class ControllableResizeObserver {
  static instances: ControllableResizeObserver[] = []

  readonly observed: Element[] = []
  disconnected = false
  private readonly callback: (entries: { contentRect: { width: number; height: number } }[]) => void

  constructor(callback: (entries: { contentRect: { width: number; height: number } }[]) => void) {
    this.callback = callback
    ControllableResizeObserver.instances.push(this)
  }

  observe(element: Element) {
    this.observed.push(element)
  }

  unobserve() {}

  disconnect() {
    this.disconnected = true
  }

  emit(width: number) {
    this.callback([{ contentRect: { width, height: 100 } }])
  }
}

const resetObservers = () => {
  ControllableResizeObserver.instances = []
}

/** Mirrors BarList: the measured container only exists once data arrived. */
function ConditionalProbe({ show, fallback = 640 }: { show: boolean; fallback?: number }) {
  const [ref, width] = useElementWidth(fallback)
  return (
    <div>
      {show ? <div ref={ref} data-testid="node" /> : <p>no data</p>}
      <output data-testid="width">{width}</output>
    </div>
  )
}

/** Mirrors a container that is replaced by a different DOM node. */
function ReplacingProbe({ variant }: { variant: number }) {
  const [ref, width] = useElementWidth(640)
  return (
    <div>
      <div key={variant} ref={ref} data-testid="node" />
      <output data-testid="width">{width}</output>
    </div>
  )
}

const widthText = () => screen.getByTestId('width').textContent

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetObservers()
})

describe('useElementWidth', () => {
  it('observes a container that only appears after the first render', async () => {
    vi.stubGlobal('ResizeObserver', ControllableResizeObserver)
    const { rerender } = render(<ConditionalProbe show={false} />)
    expect(widthText()).toBe('640')
    // An effect with an empty dependency list would stop here forever.
    expect(ControllableResizeObserver.instances).toHaveLength(0)

    rerender(<ConditionalProbe show />)
    expect(ControllableResizeObserver.instances).toHaveLength(1)
    const observer = ControllableResizeObserver.instances[0] as ControllableResizeObserver
    expect(observer.observed).toHaveLength(1)

    await act(async () => { observer.emit(472) })
    expect(widthText()).toBe('472')
  })

  it('reconnects when the observed node is replaced', async () => {
    vi.stubGlobal('ResizeObserver', ControllableResizeObserver)
    const { rerender } = render(<ReplacingProbe variant={1} />)
    const first = ControllableResizeObserver.instances[0] as ControllableResizeObserver

    rerender(<ReplacingProbe variant={2} />)
    const second = ControllableResizeObserver.instances[1] as ControllableResizeObserver
    expect(first.disconnected).toBe(true)
    expect(second.disconnected).toBe(false)
    // The new node is observed, not the detached one.
    expect(second.observed[0]).toBe(screen.getByTestId('node'))

    await act(async () => { second.emit(300) })
    expect(widthText()).toBe('300')
  })

  it('follows later width measurements of the same node', async () => {
    vi.stubGlobal('ResizeObserver', ControllableResizeObserver)
    render(<ConditionalProbe show />)
    const observer = ControllableResizeObserver.instances[0] as ControllableResizeObserver

    await act(async () => { observer.emit(500) })
    expect(widthText()).toBe('500')
    await act(async () => { observer.emit(250) })
    expect(widthText()).toBe('250')
  })

  it('disconnects the observer on unmount', () => {
    vi.stubGlobal('ResizeObserver', ControllableResizeObserver)
    const { unmount } = render(<ConditionalProbe show />)
    const observer = ControllableResizeObserver.instances[0] as ControllableResizeObserver
    expect(observer.disconnected).toBe(false)

    unmount()
    expect(observer.disconnected).toBe(true)
  })

  it('keeps the fallback width when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    expect(() => render(<ConditionalProbe show fallback={480} />)).not.toThrow()
    expect(widthText()).toBe('480')
    expect(ControllableResizeObserver.instances).toHaveLength(0)
  })
})
