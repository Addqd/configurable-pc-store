import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { render } from '../../test-utils'
import { ErrorPage } from './ErrorPage'
import { ERROR_PAGE_STATUSES, type ErrorStatus } from '../../api/errorStatus'
import { i18n } from '../../i18n'

const copy = {
  ru: {
    heading: 'Приносим извинения',
    home: 'На главную',
    back: 'Назад',
    403: { title: 'Доступ запрещён', description: 'У вас нет прав для просмотра этой страницы.' },
    404: { title: 'Страница не найдена', description: 'Возможно, ссылка устарела или страница была удалена.' },
    429: { title: 'Слишком много запросов', description: 'Пожалуйста, подождите и повторите попытку позже.' },
    500: { title: 'Внутренняя ошибка сервера', description: 'Что-то пошло не так. Пожалуйста, попробуйте позже.' },
    503: { title: 'Сервис временно недоступен', description: 'Пожалуйста, попробуйте немного позже.' },
  },
  en: {
    heading: 'We apologize',
    home: 'Home',
    back: 'Back',
    403: { title: 'Access denied', description: 'You do not have permission to view this page.' },
    404: { title: 'Page not found', description: 'The link may be outdated or the page may have been removed.' },
    429: { title: 'Too many requests', description: 'Please wait and try again later.' },
    500: { title: 'Internal server error', description: 'Something went wrong. Please try again later.' },
    503: { title: 'Service temporarily unavailable', description: 'Please try again in a little while.' },
  },
} as const

function CatalogPage() {
  return (
    <div>
      <p>CATALOG PAGE</p>
      <Link to="/broken">открыть сломанную страницу</Link>
    </div>
  )
}

/**
 * The page renders inside a real router, exactly as the application does, so Back is
 * ordinary React Router history navigation.
 */
function renderErrorPage(path = '/broken', status: ErrorStatus = 404) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>HOME PAGE</p>} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="*" element={<ErrorPage status={status} />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('ru')
})

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
})

describe('fullscreen error page', () => {
  it.each(ERROR_PAGE_STATUSES)('renders the approved Russian copy for %i', (status) => {
    renderErrorPage('/broken', status)
    const expected = copy.ru[status]

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(copy.ru.heading)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(expected.title)
    expect(screen.getByText(expected.description)).toBeTruthy()
    // The code is a real element of its own, not part of the illustration.
    expect(screen.getByText(String(status)).textContent).toBe(String(status))
  })

  it.each(ERROR_PAGE_STATUSES)('renders the approved English copy for %i', async (status) => {
    await i18n.changeLanguage('en')
    renderErrorPage('/broken', status)
    const expected = copy.en[status]

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(copy.en.heading)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(expected.title)
    expect(screen.getByText(expected.description)).toBeTruthy()
    expect(screen.getByText(copy.en.home)).toBeTruthy()
    expect(screen.getByText(copy.en.back)).toBeTruthy()
  })

  it('offers exactly the two approved controls in the approved order', () => {
    renderErrorPage()
    const home = screen.getByRole('link', { name: copy.ru.home })
    const back = screen.getByRole('button', { name: copy.ru.back })

    expect(home.getAttribute('href')).toBe('/')
    expect(home.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('link', { name: /повторить|reload|retry/i })).toBeNull()
  })

  it('keeps the error code above the illustration in separate elements', () => {
    const { container } = renderErrorPage()
    const image = container.querySelector('.pc-error-page__art') as HTMLImageElement
    const code = container.querySelector('.pc-error-page__code') as HTMLElement
    const stage = container.querySelector('.pc-error-page__stage') as HTMLElement

    expect(image).not.toBeNull()
    expect(code).not.toBeNull()
    expect(code).not.toBe(image)
    // The smoke stays inside the PNG: one asset, never split or recoloured here.
    expect(image.parentElement).toBe(stage)
    expect(code.parentElement).toBe(stage)
    expect(image.getAttribute('src')).toContain('shattered%20pc.png')
    expect(image.getAttribute('alt')).toBe('')
    expect(image.getAttribute('width')).toBe('1402')
    expect(image.getAttribute('height')).toBe('1122')
    // The code is painted after the illustration inside the same stacking context.
    expect(image.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('navigates to the homepage through the router and unmounts the error page', () => {
    renderErrorPage()
    fireEvent.click(screen.getByRole('link', { name: copy.ru.home }))

    expect(screen.getByText('HOME PAGE')).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1, name: copy.ru.heading })).toBeNull()
  })

  it('returns to the preceding page with the back button', () => {
    // The visitor reached the failing page from the catalogue, so the browser history
    // has an earlier entry and a plain `navigate(-1)` restores it.
    renderErrorPage('/catalog')
    fireEvent.click(screen.getByRole('link', { name: 'открыть сломанную страницу' }))
    expect(screen.getByText('404')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: copy.ru.back }))

    expect(screen.getByText('CATALOG PAGE')).toBeTruthy()
  })

  it('keeps the error page when the session has no earlier entry', () => {
    // Standard browser history: with nothing before it, "Back" does nothing. There is
    // deliberately no Home fallback here — the approved Home button covers that need.
    renderErrorPage('/broken-only')
    fireEvent.click(screen.getByRole('button', { name: copy.ru.back }))

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(copy.ru[404].title)
    expect(screen.queryByText('HOME PAGE')).toBeNull()
  })

  it('renders at the failed URL without redirecting anywhere', () => {
    renderErrorPage('/broken')
    // The wildcard route renders the page in place: no Navigate, no history entry replaced.
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(copy.ru[404].title)
    expect(screen.queryByText('HOME PAGE')).toBeNull()
    expect(screen.queryByText('CATALOG PAGE')).toBeNull()
  })

  it('does not change the active theme or language', async () => {
    await i18n.changeLanguage('en')
    document.documentElement.classList.add('dark')
    renderErrorPage()

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(copy.en.heading)
    fireEvent.click(screen.getByRole('button', { name: copy.en.back }))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(i18n.language).toBe('en')
  })
})
