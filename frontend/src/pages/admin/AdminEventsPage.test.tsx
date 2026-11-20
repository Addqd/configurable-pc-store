import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { render } from '../../test-utils'
import type { AdminPaginatedEventsOut } from '../../api/generated/model'
import { AdminEventsPage } from './AdminEventsPage'
import { eventsActorFixture, eventsFixture, jsonResponse, stubAdminFetch } from '../../test-admin-api'

vi.mock('../../components/Header', () => ({ Header: () => <header data-testid="header" /> }))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

function setup(fixture: AdminPaginatedEventsOut = eventsFixture) {
  const handler = (url: URL) => {
    if (url.pathname === '/api/v1/admin/events/filters') {
      return jsonResponse({
        categories: ['auth', 'account', 'order', 'build', 'review', 'admin', 'catalog', 'system'],
        event_types: ['build.created', 'review.created', 'auth.login_failed'],
        outcomes: ['success', 'failure'],
      })
    }
    if (url.pathname === '/api/v1/admin/events') return jsonResponse(fixture)
    return undefined
  }
  const fetchMock = stubAdminFetch({ handler })
  render(
    <MemoryRouter initialEntries={['/admin/events']}>
      <Routes>
        <Route path="/admin/events" element={<><AdminEventsPage /><LocationProbe /></>} />
        <Route path="/admin/users" element={<div>USERS PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return fetchMock
}

const eventRequests = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => new URL(url, 'http://localhost').pathname === '/api/v1/admin/events')
    .map((url) => new URL(url, 'http://localhost').searchParams)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('admin event journal', () => {
  it('renders readable events and the journal chrome', async () => {
    setup()
    expect(await screen.findByText('Создал сборку #28')).toBeTruthy()
    expect(screen.getByText('Оставил отзыв #31')).toBeTruthy()
    expect(screen.getByText('Неудачная попытка входа')).toBeTruthy()
    expect(screen.getByText('Неверный пароль')).toBeTruthy()
    expect(screen.getByText('Неизвестный')).toBeTruthy()
    expect(screen.getByText('IvanCool')).toBeTruthy()
    expect(screen.getByText('Alex')).toBeTruthy()
    expect(screen.getAllByText('Успешно').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ошибка').length).toBeGreaterThan(0)
    expect(screen.getByText('Показано 1–10 из 247')).toBeTruthy()
  })

  it('shows the year in event timestamps so equal day/month values stay distinguishable', async () => {
    setup()
    await screen.findByText('Создал сборку #28')
    const stamps = screen.getAllByText(/17\.11\.2026/)
    expect(stamps.length).toBeGreaterThan(0)
    expect(stamps[0]?.textContent).toMatch(/^17\.11\.2026, \d{2}:\d{2}$/)
  })

  it('sends search, category, date and pagination filters to the API', async () => {
    const fetchMock = setup()
    await screen.findByText('Создал сборку #28')

    fireEvent.change(screen.getByLabelText('Поиск по журналу событий'), { target: { value: 'вход' } })
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('q='))).toBe(true))

    fireEvent.change(screen.getByLabelText('Категория'), { target: { value: 'auth' } })
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('category=auth'))).toBe(true))

    fireEvent.change(screen.getByLabelText('С даты'), { target: { value: '2026-11-01' } })
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('date_from=2026-11-01'))).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Страница 2' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true))
  })

  it('never requests an inverted date range', async () => {
    const fetchMock = setup()
    await screen.findByText('Создал сборку #28')

    // A half-filled range is a legitimate request.
    fireEvent.change(screen.getByLabelText('С даты'), { target: { value: '2026-12-01' } })
    await waitFor(() => expect(eventRequests(fetchMock).some((params) => params.get('date_from') === '2026-12-01')).toBe(true))
    const callsBeforeInvalidRange = eventRequests(fetchMock).length

    fireEvent.change(screen.getByLabelText('По дату'), { target: { value: '2026-11-01' } })
    expect(await screen.findByText('Проверьте заполнение полей.')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('date_to=2026-11-01'))

    const inverted = eventRequests(fetchMock).filter((params) => {
      const from = params.get('date_from')
      const to = params.get('date_to')
      return Boolean(from && to && from > to)
    })
    expect(inverted).toHaveLength(0)
    // The invalid combination does not trigger any additional request at all.
    expect(eventRequests(fetchMock)).toHaveLength(callsBeforeInvalidRange)
  })

  it('never submits a search query longer than the server limit', async () => {
    const fetchMock = setup()
    await screen.findByText('Создал сборку #28')

    fireEvent.change(screen.getByLabelText('Поиск по журналу событий'), { target: { value: 'я'.repeat(150) } })
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain('q='))

    const queries = eventRequests(fetchMock).map((params) => params.get('q')).filter(Boolean) as string[]
    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries) expect(query.length).toBeLessThanOrEqual(120)
  })

  it('closes back to the user management screen', async () => {
    setup()
    await screen.findByText('Создал сборку #28')
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть журнал' }))
    expect(await screen.findByText('USERS PAGE')).toBeTruthy()
  })
})

describe('admin event journal actor columns', () => {
  const tableRows = () =>
    Array.from(document.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent ?? ''),
    )

  it('renders the five required columns in the required order', async () => {
    setup()
    await screen.findByText('Создал сборку #28')
    const headers = Array.from(document.querySelectorAll('table thead th')).map((cell) => cell.textContent)
    expect(headers).toEqual(['Время', 'Имя пользователя', 'ID пользователя', 'Событие', 'Результат'])
  })

  it('shows the real username and the numeric id in separate columns', async () => {
    setup()
    const row = (await screen.findByText('Создал сборку #28')).closest('tr') as HTMLElement
    const cells = within(row).getAllByRole('cell')
    expect(cells[1]?.textContent).toBe('IvanCool')
    expect(cells[2]?.textContent).toBe('104')
    // No combined `Пользователь #104` label survives anywhere in the row.
    expect(row.textContent).not.toContain('Пользователь #104')
  })

  it('keeps admins, owners, deleted users and system events distinguishable', async () => {
    setup(eventsActorFixture)
    await screen.findByText('Создал сборку #28')
    const actors = tableRows().map((cells) => [cells[1], cells[2]])
    expect(actors).toEqual([
      ['IvanCool', '104'],
      ['AdminMaster', '42'],
      ['owner', '1'],
      // Deleted accounts: the recorded snapshot is shown, never a made-up name.
      ['DeletedIvan', '56'],
      ['Администратор (недоступен)', '57'],
      // System-generated events have no actor and no id.
      ['Система', '—'],
    ])
    // The unknown-actor label stays reserved for failed authentication.
    expect(screen.queryByText('Неизвестный')).toBeNull()
  })
})
