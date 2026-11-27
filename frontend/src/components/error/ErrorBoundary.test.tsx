import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { render } from '../../test-utils'
import { ErrorBoundary, RouteErrorBoundary } from './ErrorBoundary'
import { i18n } from '../../i18n'

const copy = {
  heading: 'Приносим извинения',
  title: 'Внутренняя ошибка сервера',
  description: 'Что-то пошло не так. Пожалуйста, попробуйте позже.',
  home: 'На главную',
}

function ThrowingPage(): never {
  throw new Error('page rendering failed')
}

function Bombshell(): never {
  throw new Error('fallback rendering failed')
}

/** Navigating with a link is the only way a visitor leaves a failed page. */
function RoutesUnderBoundary() {
  return (
    <MemoryRouter initialEntries={['/boom']}>
      <RouteErrorBoundary>
        <Routes>
          <Route path="/boom" element={<ThrowingPage />} />
          <Route path="/" element={<p>HOME PAGE</p>} />
        </Routes>
      </RouteErrorBoundary>
    </MemoryRouter>
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('ru')
  // React reports the caught error to the console; the interface must stay clean.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('route error boundary', () => {
  it('replaces a page that cannot render with the approved 500 page', () => {
    render(<RoutesUnderBoundary />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(copy.heading)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(copy.title)
    expect(screen.getByText(copy.description)).toBeTruthy()
    expect(screen.getByText('500')).toBeTruthy()
    // The exception text never reaches the interface.
    expect(screen.queryByText(/page rendering failed/)).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it('recovers on the next valid navigation instead of staying stuck', () => {
    render(<RoutesUnderBoundary />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(copy.title)

    fireEvent.click(screen.getByRole('link', { name: copy.home }))

    expect(screen.getByText('HOME PAGE')).toBeTruthy()
    expect(screen.queryByText('500')).toBeNull()
  })

  it('resets a shown fallback as soon as its reset key changes', () => {
    function Harness() {
      const [key, setKey] = useState('failed')
      return (
        <div>
          <button type="button" onClick={() => setKey('recovered')}>change route</button>
          <ErrorBoundary resetKey={key} fallback={<p>FALLBACK</p>}>
            {key === 'failed' ? <ThrowingPage /> : <p>RECOVERED PAGE</p>}
          </ErrorBoundary>
        </div>
      )
    }
    render(<Harness />)
    expect(screen.getByText('FALLBACK')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'change route' }))

    expect(screen.getByText('RECOVERED PAGE')).toBeTruthy()
    expect(screen.queryByText('FALLBACK')).toBeNull()
  })

  it('does not loop when the fallback itself fails', () => {
    render(
      <MemoryRouter initialEntries={['/boom']}>
        <ErrorBoundary
          resetKey="route"
          fallback={(
            <ErrorBoundary resetKey="last-resort" fallback={<p>LAST RESORT</p>}>
              <Bombshell />
            </ErrorBoundary>
          )}
        >
          <Routes><Route path="/boom" element={<ThrowingPage />} /></Routes>
        </ErrorBoundary>
      </MemoryRouter>,
    )

    expect(screen.getByText('LAST RESORT')).toBeTruthy()
    expect(screen.queryByText(/fallback rendering failed/)).toBeNull()
  })
})
