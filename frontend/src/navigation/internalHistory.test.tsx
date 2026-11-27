import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router'
import { render } from '../test-utils'
import { useInternalHistory } from './internalHistory'
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
