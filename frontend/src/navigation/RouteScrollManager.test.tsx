import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { RouteScrollManager } from './RouteScrollManager'

/** jsdom keeps the document at 0; the tests move a stub position instead. */
let scrollY = 0
/** The stubbed document height, so a scroll can be clamped like in a real browser. */
let documentHeight = 5000
const viewportHeight = 768
const resizeCallbacks: (() => void)[] = []
const setScroll = (value: number) => {
  scrollY = value
  window.dispatchEvent(new Event('scroll'))
}
/** Moves the position silently, the way a clamp does before any scroll event. */
const setScrollSilently = (value: number) => { scrollY = value }
const growDocument = (height: number) => {
  documentHeight = height
  act(() => resizeCallbacks.forEach((callback) => callback()))
}

function Harness() {
  const navigate = useNavigate()
  return (
    <>
      <RouteScrollManager />
      <Link to="/catalog">catalog</Link>
      <Link to="/products/a">product a</Link>
      <Link to="/products/b">product b</Link>
      <Link to="/catalog?page=2">catalog page 2</Link>
      <Link to="/catalog#reviews">catalog reviews</Link>
      <button type="button" onClick={() => navigate('/cart', { replace: true })}>replace with cart</button>
      <button type="button" onClick={() => navigate(-1)}>history back</button>
      <button type="button" onClick={() => navigate(1)}>history forward</button>
      <Routes>
        <Route path="/catalog" element={<p>catalog page</p>} />
        <Route path="/products/:slug" element={<p>product page</p>} />
        <Route path="/cart" element={<p>cart page</p>} />
      </Routes>
    </>
  )
}

function renderApp(path = '/catalog') {
  render(<MemoryRouter initialEntries={[path]}><Harness /></MemoryRouter>)
}

const scrollToMock = () => vi.mocked(window.scrollTo)

beforeEach(() => {
  scrollY = 0
  documentHeight = 5000
  resizeCallbacks.length = 0
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => documentHeight })
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resizeCallbacks.push(callback) }
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  vi.spyOn(window, 'scrollTo').mockImplementation(((options: ScrollToOptions | number) => {
    const top = typeof options === 'number' ? options : options.top ?? 0
    scrollY = Math.max(0, Math.min(top, documentHeight - viewportHeight))
  }) as typeof window.scrollTo)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('route scroll manager', () => {
  it('leaves the first paint of the application alone', () => {
    renderApp()
    expect(scrollToMock()).not.toHaveBeenCalled()
  })

  it('keeps the leaving position even when the outgoing page was clamped before the switch', () => {    renderApp()
    // A click happens while the old page still shows its scrolled position.
    setScrollSilently(640)
    fireEvent.click(screen.getByRole('link', { name: 'product a' }))
    expect(window.scrollY).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'history back' }))
    expect(window.scrollY).toBe(640)
  })

  it('starts a pushed page at the top', () => {
    renderApp()
    setScroll(940)
    fireEvent.click(screen.getByRole('link', { name: 'product a' }))
    expect(scrollToMock()).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'instant' })
    expect(window.scrollY).toBe(0)
  })

  it('starts a replaced page at the top', () => {
    renderApp()
    setScroll(620)
    fireEvent.click(screen.getByRole('button', { name: 'replace with cart' }))
    expect(scrollToMock()).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'instant' })
    expect(window.scrollY).toBe(0)
  })

  it('restores the saved position of the entry when going back', () => {
    renderApp()
    setScroll(940)
    fireEvent.click(screen.getByRole('link', { name: 'product a' }))
    expect(window.scrollY).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'history back' }))
    expect(window.scrollY).toBe(940)
  })

  it('finishes restoring a position the returning page could not reach while loading', () => {
    renderApp()
    setScroll(940)
    fireEvent.click(screen.getByRole('link', { name: 'product a' }))
    // The page being returned to paints a short placeholder first.
    documentHeight = viewportHeight
    fireEvent.click(screen.getByRole('button', { name: 'history back' }))
    expect(window.scrollY).toBe(0)
    // Its content arrives and the saved position becomes reachable.
    growDocument(5000)
    expect(window.scrollY).toBe(940)
  })

  it('stops restoring when the visitor scrolls before the page has loaded', () => {
    renderApp()
    setScroll(940)
    fireEvent.click(screen.getByRole('link', { name: 'product a' }))
    documentHeight = viewportHeight
    fireEvent.click(screen.getByRole('button', { name: 'history back' }))
    fireEvent.wheel(window)
    growDocument(5000)
    expect(window.scrollY).toBe(0)
  })

  it('restores the saved position again when going forward', () => {
    renderApp()
    setScroll(940)
    fireEvent.click(screen.getByRole('link', { name: 'product a' }))
    fireEvent.click(screen.getByRole('button', { name: 'history back' }))
    setScroll(480)
    fireEvent.click(screen.getByRole('link', { name: 'product b' }))
    fireEvent.click(screen.getByRole('button', { name: 'history back' }))
    expect(window.scrollY).toBe(480)
    fireEvent.click(screen.getByRole('button', { name: 'history forward' }))
    expect(window.scrollY).toBe(0)
  })

  it('starts at the top when the history entry has no saved position', () => {
    renderApp()
    setScroll(700)
    fireEvent.click(screen.getByRole('link', { name: 'product a' }))
    fireEvent.click(screen.getByRole('button', { name: 'history back' }))
    setScroll(300)
    scrollToMock().mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'history forward' }))
    expect(scrollToMock()).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'instant' })
    expect(window.scrollY).toBe(0)
  })

  it('keeps the page position for query-only navigation', () => {
    renderApp()
    setScroll(700)
    fireEvent.click(screen.getByRole('link', { name: 'catalog page 2' }))
    expect(scrollToMock()).not.toHaveBeenCalled()
    expect(window.scrollY).toBe(700)
  })

  it('does not override an anchor target', () => {
    renderApp()
    setScroll(700)
    fireEvent.click(screen.getByRole('link', { name: 'catalog reviews' }))
    expect(scrollToMock()).not.toHaveBeenCalled()
  })

  it('takes the browser scroll restoration over while mounted', () => {
    const initial = window.history.scrollRestoration
    renderApp()
    expect(window.history.scrollRestoration).toBe('manual')
    cleanup()
    expect(window.history.scrollRestoration).toBe(initial)
  })
})
