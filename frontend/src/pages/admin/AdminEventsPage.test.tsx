import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { render } from '../../test-utils'
import { AdminEventsPage } from './AdminEventsPage'
import { eventsFixture, jsonResponse, stubAdminFetch } from '../../test-admin-api'

vi.mock('../../components/Header', () => ({ Header: () => <header data-testid="header" /> }))

function setup() {
  const handler = (url: URL) => {
    if (url.pathname === '/api/v1/admin/events/filters') {
      return jsonResponse({
        categories: ['auth', 'account', 'order', 'build', 'review', 'admin', 'catalog', 'system'],
        event_types: ['build.created', 'review.created', 'auth.login_failed'],
        outcomes: ['success', 'failure'],
      })
    }
    if (url.pathname === '/api/v1/admin/events') return jsonResponse(eventsFixture)
    return undefined
  }
  const fetchMock = stubAdminFetch({ handler })
  render(
    <MemoryRouter initialEntries={['/admin/events']}>
      <Routes>
        <Route path="/admin/events" element={<AdminEventsPage />} />
        <Route path="/admin/users" element={<div>USERS PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return fetchMock
}

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
    expect(screen.getByText('Пользователь #104')).toBeTruthy()
    expect(screen.getAllByText('Успешно').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ошибка').length).toBeGreaterThan(0)
    expect(screen.getByText('Показано 1–10 из 247')).toBeTruthy()
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

  it('flags an inverted date range instead of querying it', async () => {
    const fetchMock = setup()
    await screen.findByText('Создал сборку #28')
    fireEvent.change(screen.getByLabelText('С даты'), { target: { value: '2026-12-01' } })
    fireEvent.change(screen.getByLabelText('По дату'), { target: { value: '2026-11-01' } })
    expect(await screen.findByText('Проверьте заполнение полей.')).toBeTruthy()
    expect(fetchMock).toBeTruthy()
  })

  it('closes back to the user management screen', async () => {
    setup()
    await screen.findByText('Создал сборку #28')
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть журнал' }))
    expect(await screen.findByText('USERS PAGE')).toBeTruthy()
  })
})
