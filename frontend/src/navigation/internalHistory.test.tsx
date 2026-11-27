import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { BrowserRouter, Link, Route, Routes, useNavigate, type NavigateFunction, type NavigationType } from 'react-router'
import { render } from '../test-utils'
import { InternalHistoryTracker, useInternalHistory } from './internalHistory'
import { InternalHistoryProvider } from './InternalHistoryProvider'
import { ErrorPage } from '../components/error/ErrorPage'
import { i18n } from '../i18n'

/** Uses the tracker the way the fullscreen error page uses it, without the page. */
function BackProbe() {
  const { back } = useInternalHistory()
  return <button type="button" onClick={back}>назад по трекеру</button>
}

/** Replaces the current entry, like a redirect that leaves no earlier entry behind. */
function ReplaceButton() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate('/replaced', { replace: true })}>заменить</button>
}

/**
 * The application shape: BrowserRouter, the tracker, links and the error page.
 * These tests use the real browser history, because the reviewed defect was about
 * real history entries, not about router-in-memory behavior.
 */
function BrowserApp({ children }: { children?: React.ReactNode }) {
  return (
    <BrowserRouter>
      <InternalHistoryProvider>
        <Link to="/catalog">в каталог</Link>
        <Link to="/error">на сломанную страницу</Link>
        {children}
        <Routes>
          <Route path="/" element={<p>HOME PAGE</p>} />
          <Route path="/start" element={<p>START PAGE</p>} />
          <Route path="/catalog" element={<p>CATALOG PAGE</p>} />
          <Route path="/replaced" element={<p>REPLACED PAGE</p>} />
          <Route path="/error" element={<ErrorPage status={404} />} />
        </Routes>
      </InternalHistoryProvider>
    </BrowserRouter>
  )
}

/** Opens the page as a fresh top-level entry: no key, no earlier application entry. */
function enterAt(path: string) {
  window.history.replaceState({}, '', path)
}

beforeEach(async () => {
  await i18n.changeLanguage('ru')
})

afterEach(() => {
  cleanup()
  enterAt('/')
})

describe('safe back navigation with real browser history', () => {
  it('falls back to the storefront on a direct entry', async () => {
    enterAt('/start')
    render(<BrowserApp><BackProbe /></BrowserApp>)

    fireEvent.click(screen.getByRole('button', { name: 'назад по трекеру' }))

    expect(await screen.findByText('HOME PAGE')).toBeTruthy()
    expect(window.location.pathname).toBe('/')
  })

  it('returns to the previous internal page after an ordinary navigation', async () => {
    enterAt('/start')
    render(<BrowserApp><BackProbe /></BrowserApp>)

    fireEvent.click(screen.getByRole('link', { name: 'в каталог' }))
    expect(await screen.findByText('CATALOG PAGE')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'назад по трекеру' }))

    expect(await screen.findByText('START PAGE')).toBeTruthy()
    expect(window.location.pathname).toBe('/start')
  })

  it('does not treat a replaced first entry as a previous page', async () => {
    enterAt('/start')
    render(<BrowserApp><ReplaceButton /><BackProbe /></BrowserApp>)

    fireEvent.click(screen.getByRole('button', { name: 'заменить' }))
    expect(await screen.findByText('REPLACED PAGE')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'назад по трекеру' }))

    // A REPLACE changed the key but created no earlier entry: the storefront is the
    // only safe destination, and it replaces the failed entry.
    expect(await screen.findByText('HOME PAGE')).toBeTruthy()
    expect(window.location.pathname).toBe('/')
  })

  it('stays conservative when the current entry came from another document', async () => {
    // A reload keeps a history state whose key this session never recorded.
    window.history.replaceState({ key: 'entry-from-a-previous-document' }, '', '/start')
    render(<BrowserApp><BackProbe /></BrowserApp>)

    fireEvent.click(screen.getByRole('button', { name: 'назад по трекеру' }))

    expect(await screen.findByText('HOME PAGE')).toBeTruthy()
  })

  it('keeps working after an error page was shown and left', async () => {
    enterAt('/start')
    render(<BrowserApp />)

    fireEvent.click(screen.getByRole('link', { name: 'в каталог' }))
    expect(await screen.findByText('CATALOG PAGE')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'на сломанную страницу' }))
    expect(await screen.findByText('404')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))

    expect(await screen.findByText('CATALOG PAGE')).toBeTruthy()
    expect(window.location.pathname).toBe('/catalog')

    // The same failing page opened again still knows the catalogue behind it.
    fireEvent.click(screen.getByRole('link', { name: 'на сломанную страницу' }))
    expect(await screen.findByText('404')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))

    expect(await screen.findByText('CATALOG PAGE')).toBeTruthy()
    await waitFor(() => expect(window.location.pathname).toBe('/catalog'))
  })
})

/** A tracked location, as `record()` receives it. */
const entry = (key: string, pathname = `/${key}`) => ({ key, pathname, search: '' })

/** The router's own action values, so the tracker can be driven without a router. */
const PUSH = 'PUSH' as NavigationType
const POP = 'POP' as NavigationType
const REPLACE = 'REPLACE' as NavigationType

/** Where `back()` would send the visitor: `-1` for a POP, or the replaced target. */
function backCalls(tracker: InternalHistoryTracker) {
  const calls: string[] = []
  const navigate = ((to: unknown, options?: { replace?: boolean }) => {
    calls.push(options?.replace ? `${String(to)} replace` : String(to))
  }) as unknown as NavigateFunction
  tracker.back(navigate)
  return calls
}

describe('failure markers follow the lifetime of their history entries', () => {
  it('drops the markers of the entries a PUSH truncated', () => {
    const tracker = new InternalHistoryTracker()
    tracker.record(entry('a'), PUSH)
    tracker.record(entry('b'), PUSH)
    tracker.record(entry('c'), PUSH)
    tracker.markFailedEntry('b')
    expect(tracker.failedEntryCount).toBe(1)

    // Back to 'a', then a new branch: 'b' and 'c' leave the tracked history for good.
    tracker.record(entry('a'), POP)
    tracker.record(entry('d'), PUSH)

    expect(tracker.failedEntryCount).toBe(0)
    // 'a' is still the proven previous entry, so it is a valid Back destination.
    expect(backCalls(tracker)).toEqual(['-1'])
  })

  it('drops the marker of an entry that was replaced', () => {
    const tracker = new InternalHistoryTracker()
    tracker.record(entry('a'), PUSH)
    tracker.record(entry('b'), PUSH)
    tracker.markFailedEntry('b')

    tracker.record(entry('b-replaced', '/b'), REPLACE)

    expect(tracker.failedEntryCount).toBe(0)
    expect(backCalls(tracker)).toEqual(['-1'])
  })

  it('clears obsolete markers when an unknown POP resets the tracked history', () => {
    const tracker = new InternalHistoryTracker()
    tracker.record(entry('a'), PUSH)
    tracker.record(entry('b'), PUSH)
    tracker.markFailedEntry('a')
    tracker.markFailedEntry('b')
    expect(tracker.failedEntryCount).toBe(2)

    // A reload or another document proves nothing about the earlier stack.
    tracker.record(entry('foreign-key', '/elsewhere'), POP)

    expect(tracker.failedEntryCount).toBe(0)
    expect(backCalls(tracker)).toEqual(['/ replace'])
  })

  it('bounds the markers by the bounded history', () => {
    const tracker = new InternalHistoryTracker()
    // The real order: the error page claims its entry, then the provider records it.
    for (let index = 0; index < 150; index += 1) {
      tracker.markFailedEntry(`key-${index}`)
      tracker.record(entry(`key-${index}`), PUSH)
    }

    expect(tracker.failedEntryCount).toBe(100)
    // The newest failed entry still blocks Back into the one before it.
    expect(backCalls(tracker)).toEqual(['/ replace'])
  })

  it('keeps the marker of a failed entry when the visitor navigates away', () => {
    const tracker = new InternalHistoryTracker()
    tracker.record(entry('a'), PUSH)
    tracker.record(entry('b'), PUSH)
    tracker.markFailedEntry('b')
    // Unmounting the error page is not a recovery.
    tracker.releaseEntry('b')
    tracker.record(entry('c'), PUSH)

    expect(tracker.failedEntryCount).toBe(1)
    // From 'c' the previous entry is the failed 'b', so Back must not step into it.
    expect(backCalls(tracker)).toEqual(['/ replace'])
  })

  it('never undoes a marker that a mounted error page claimed', () => {
    const tracker = new InternalHistoryTracker()
    tracker.record(entry('a'), PUSH)
    tracker.record(entry('b'), PUSH)
    tracker.markFailedEntry('b')

    // A healthy report for the same commit that mounted the error page cannot win.
    tracker.reportHealthyEntry('b')

    expect(tracker.failedEntryCount).toBe(1)
    // 'a' is untouched, so the marker only describes 'b' itself.
    expect(backCalls(tracker)).toEqual(['-1'])
  })

  it('keeps the marker of an entry that the error page claimed before it was recorded', () => {
    const tracker = new InternalHistoryTracker()
    tracker.record(entry('a'), PUSH)

    // The real order in one commit: the error page's effect marks its own entry first,
    // the provider then records that same (not yet known) location. Pruning must not
    // throw the marker away because the entry only joins the tracked history now.
    tracker.markFailedEntry('b')
    tracker.record(entry('b'), PUSH)

    expect(tracker.failedEntryCount).toBe(1)
  })

  it('makes a failed entry eligible again after it recovers', () => {
    const tracker = new InternalHistoryTracker()
    tracker.record(entry('a'), PUSH)
    tracker.record(entry('b'), PUSH)
    tracker.markFailedEntry('b')
    tracker.releaseEntry('b')

    // The same entry now renders normal page content.
    tracker.reportHealthyEntry('b')

    expect(tracker.failedEntryCount).toBe(0)
    expect(backCalls(tracker)).toEqual(['-1'])
  })
})

describe('registration under StrictMode', () => {
  it('keeps the marker of a freshly mounted error page across the double invocation', async () => {
    function StrictApp() {
      return (
        <BrowserRouter>
          <InternalHistoryProvider>
            <Link to="/error-one">к первой ошибке</Link>
            <Link to="/error-two">ко второй ошибке</Link>
            <Routes>
              <Route path="/" element={<p>HOME PAGE</p>} />
              <Route path="/catalog" element={<p>CATALOG PAGE</p>} />
              <Route path="/error-one" element={<ErrorPage status={404} />} />
              <Route path="/error-two" element={<ErrorPage status={503} />} />
            </Routes>
          </InternalHistoryProvider>
        </BrowserRouter>
      )
    }

    enterAt('/catalog')
    render(<StrictMode><StrictApp /></StrictMode>)

    fireEvent.click(screen.getByRole('link', { name: 'к первой ошибке' }))
    expect(await screen.findByText('404')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'ко второй ошибке' }))
    expect(await screen.findByText('503')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))

    // The first error page kept its marker through setup → cleanup → setup, so Back
    // skips it instead of bouncing between two error pages.
    expect(await screen.findByText('HOME PAGE')).toBeTruthy()
  })
})
