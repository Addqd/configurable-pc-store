import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { act } from 'react'
import { render } from '../../test-utils'
import i18n from '../../i18n'
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
        <Route path="/admin/events" element={<><AdminEventsPage /><LocationProbe /><HistoryProbe /></>} />
        <Route path="/admin/users" element={<div>USERS PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return fetchMock
}

/** Drives real browser-style history navigation inside the memory router. */
function HistoryProbe() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => void navigate(-1)}>История назад</button>
  )
}

const eventRequests = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => new URL(url, 'http://localhost').pathname === '/api/v1/admin/events')
    .map((url) => new URL(url, 'http://localhost').searchParams)

/**
 * Expected local rendering of a fixture timestamp.
 *
 * The journal shows local time on purpose, so the expectation is derived from the
 * timestamp in the host's zone instead of hard-coding a date that only holds in
 * one timezone. The parts are read with `Date` getters, i.e. independently of the
 * `Intl` formatter under test.
 */
const localStamp = (iso: string, separator = '.') => {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getDate())}${separator}${pad(date.getMonth() + 1)}${separator}${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await act(async () => { await i18n.changeLanguage('ru') })
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
    expect(screen.getAllByRole('button', { name: 'Назад' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'В магазин' })).toBeNull()
  })

  it('shows the year in event timestamps so equal day/month values stay distinguishable', async () => {
    setup()
    const row = (await screen.findByText('Создал сборку #28')).closest('tr') as HTMLElement
    const occurredAt = eventsFixture.items[0].occurred_at
    const expected = localStamp(occurredAt)
    // The host timezone decides the calendar date of a UTC timestamp: the
    // expectation is derived from the fixture instead of assuming UTC.
    expect(row.textContent).toContain(expected)
    expect(expected).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/)
  })

  it('keeps events of different years distinguishable in the timestamp column', async () => {
    const baseEvent = eventsActorFixture.items[0]
    setup({
      items: [
        { ...baseEvent, id: 401, occurred_at: '2025-11-17T14:52:00Z' },
        { ...baseEvent, id: 402, occurred_at: '2026-11-17T14:52:00Z' },
      ],
      total: 2, page: 1, page_size: 10, total_pages: 1,
    })
    await screen.findAllByText('Создал сборку #28')
    const cells = Array.from(document.querySelectorAll('tbody tr')).map((row) => row.querySelector('td')?.textContent ?? '')
    expect(cells).toHaveLength(2)
    expect(cells[0]).toContain(localStamp('2025-11-17T14:52:00Z'))
    expect(cells[1]).toContain(localStamp('2026-11-17T14:52:00Z'))
    expect(cells[0]).not.toBe(cells[1])
  })

  it('uses the locale date format for event timestamps', async () => {
    await act(async () => { await i18n.changeLanguage('en') })
    setup()
    const row = (await screen.findByText('Created a build #28')).closest('tr') as HTMLElement
    const expected = localStamp(eventsFixture.items[0].occurred_at, '/')
    expect(row.textContent).toContain(expected)
  })

  it('sends search, category, date and pagination filters to the API', async () => {
    const fetchMock = setup()
    await screen.findByText('Создал сборку #28')

    fireEvent.change(screen.getByLabelText('Поиск по журналу событий'), { target: { value: 'вход' } })
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('q='))).toBe(true))

    fireEvent.change(screen.getByLabelText('Категория'), { target: { value: 'auth' } })
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('category=auth'))).toBe(true))

    fireEvent.change(screen.getByLabelText('С даты'), { target: { value: '01112026' } })
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('date_from=2026-11-01'))).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Страница 2' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true))
  })

  it('never requests an inverted date range', async () => {
    const fetchMock = setup()
    await screen.findByText('Создал сборку #28')

    // A half-filled range is a legitimate request.
    fireEvent.change(screen.getByLabelText('С даты'), { target: { value: '01122026' } })
    await waitFor(() => expect(eventRequests(fetchMock).some((params) => params.get('date_from') === '2026-12-01')).toBe(true))
    const callsBeforeInvalidRange = eventRequests(fetchMock).length

    fireEvent.change(screen.getByLabelText('По дату'), { target: { value: '01112026' } })
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

describe('admin event journal date fields', () => {
  const dateFromInput = () => screen.getByLabelText('С даты') as HTMLInputElement
  const dateToInput = () => screen.getByLabelText('По дату') as HTMLInputElement
  // Both date fields and the page's inverted-range alert use `role="alert"`, so
  // the field message is identified by its id.
  const fieldNotice = () =>
    screen
      .queryAllByRole('alert')
      .find((element) => element.id.endsWith('-notice')) ?? null
  const locationText = () => screen.getByTestId('location').textContent ?? ''

  it('inserts the date separators while the admin types', async () => {
    const fetchMock = setup()
    await screen.findByText('Создал сборку #28')
    const input = dateFromInput()

    const steps: [string, string][] = [
      ['0', '0'],
      ['01', '01'],
      ['011', '01.1'],
      ['0111', '01.11'],
      ['01112', '01.11.2'],
      ['011120', '01.11.20'],
      ['0111202', '01.11.202'],
      ['01112026', '01.11.2026'],
    ]
    for (const [typed, expected] of steps) {
      fireEvent.change(input, { target: { value: typed } })
      expect(input.value).toBe(expected)
    }

    // Only the complete day reaches the URL and the API, as an ISO date.
    await waitFor(() => expect(locationText()).toContain('date_from=2026-11-01'))
    expect(eventRequests(fetchMock).every((params) => (params.get('date_from') ?? '2026-11-01') === '2026-11-01')).toBe(true)
  })

  it('never sends an impossible day to the API and says the filter was not applied', async () => {
    const fetchMock = setup()
    await screen.findByText('Создал сборку #28')
    const input = dateFromInput()

    // A real filter is applied first, so the invalid draft has something to keep.
    fireEvent.change(input, { target: { value: '01112026' } })
    await waitFor(() => expect(locationText()).toContain('date_from=2026-11-01'))
    const callsBeforeInvalid = eventRequests(fetchMock).length

    fireEvent.change(input, { target: { value: '31022026' } })
    expect(input.value).toBe('31.02.2026')

    // The message appears as soon as the date is complete but impossible, and the
    // still-active filter is named instead of being silently replaced in the UI.
    const notice = await waitFor(() => {
      const element = fieldNotice()
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    expect(notice.textContent).toBe('Дата не применена. Действует прежний фильтр: 01.11.2026.')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe(notice.id)

    // The draft never reaches the URL or the API, the applied filter survives.
    expect(locationText()).toContain('date_from=2026-11-01')
    expect(eventRequests(fetchMock)).toHaveLength(callsBeforeInvalid)
    expect(eventRequests(fetchMock).at(-1)?.get('date_from')).toBe('2026-11-01')

    // Correcting the day clears the message and applies the new date.
    fireEvent.change(input, { target: { value: '28022026' } })
    await waitFor(() => expect(locationText()).toContain('date_from=2026-02-28'))
    expect(fieldNotice()).toBeNull()
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(eventRequests(fetchMock).at(-1)?.get('date_from')).toBe('2026-02-28')
  })

  it('reports an impossible day on its own when no filter was applied yet', async () => {
    const fetchMock = setup()
    await screen.findByText('Создал сборку #28')
    const input = dateFromInput()
    const callsBeforeTyping = eventRequests(fetchMock).length

    fireEvent.change(input, { target: { value: '31022026' } })
    await waitFor(() => expect(fieldNotice()?.textContent).toBe('Дата не применена.'))
    expect(locationText()).not.toContain('date_from')
    expect(eventRequests(fetchMock)).toHaveLength(callsBeforeTyping)

    // An empty field clears the message: there is no applied filter to explain.
    fireEvent.change(input, { target: { value: '' } })
    expect(fieldNotice()).toBeNull()
  })

  it('resets an impossible draft even though no date filter is applied', async () => {
    const fetchMock = setup()
    await screen.findByText('Создал сборку #28')
    const input = dateFromInput()
    const callsBeforeTyping = eventRequests(fetchMock).length

    fireEvent.change(input, { target: { value: '31022026' } })
    await waitFor(() => expect(fieldNotice()?.textContent).toBe('Дата не применена.'))
    // Nothing is filtered by date, but the field holds something that must be cleared.
    const reset = screen.getByRole('button', { name: 'Сбросить' }) as HTMLButtonElement
    await waitFor(() => expect(reset.disabled).toBe(false))

    fireEvent.click(reset)

    await waitFor(() => expect(input.value).toBe(''))
    expect(dateToInput().value).toBe('')
    expect(fieldNotice()).toBeNull()
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(locationText()).not.toContain('date_from')
    expect(locationText()).not.toContain('date_to')
    // The impossible day never reached the API.
    expect(eventRequests(fetchMock)).toHaveLength(callsBeforeTyping)
    expect(eventRequests(fetchMock).every((params) => !params.get('date_from'))).toBe(true)
  })

  it('resets an unfinished draft and keeps the other filters intact', async () => {
    const fetchMock = setup()
    await screen.findByText('Создал сборку #28')

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'order' } })
    await waitFor(() => expect(locationText()).toContain('category=order'))
    const callsBeforeTyping = eventRequests(fetchMock).length

    const input = dateFromInput()
    fireEvent.change(input, { target: { value: '0211' } })
    const reset = screen.getByRole('button', { name: 'Сбросить' }) as HTMLButtonElement
    await waitFor(() => expect(reset.disabled).toBe(false))

    fireEvent.click(reset)

    await waitFor(() => expect(input.value).toBe(''))
    expect(fieldNotice()).toBeNull()
    // Only the dates are reset: the category filter and its data stay.
    expect(locationText()).toContain('category=order')
    expect(locationText()).not.toContain('date_from')
    expect(eventRequests(fetchMock)).toHaveLength(callsBeforeTyping)
  })

  it('keeps the reset button disabled while both fields are empty', async () => {
    setup()
    await screen.findByText('Создал сборку #28')
    const reset = screen.getByRole('button', { name: 'Сбросить' }) as HTMLButtonElement
    expect(reset.disabled).toBe(true)
  })

  it('does not report a date that is still being typed, but does once the field is left', async () => {
    setup()
    await screen.findByText('Создал сборку #28')
    const input = dateFromInput()

    fireEvent.change(input, { target: { value: '0111' } })
    expect(fieldNotice()).toBeNull()

    // Leaving an unfinished draft must not look like an applied filter either.
    fireEvent.focusOut(input)
    const notice = await waitFor(() => {
      const element = fieldNotice()
      expect(element).not.toBeNull()
      return element as HTMLElement
    })
    expect(notice.textContent).toBe('Введите дату полностью.')
    expect(locationText()).not.toContain('date_from')
  })

  it('keeps the previous filter and names it when an unfinished draft is left behind', async () => {
    const fetchMock = setup()
    await screen.findByText('Создал сборку #28')
    const input = dateFromInput()

    fireEvent.change(input, { target: { value: '01112026' } })
    await waitFor(() => expect(locationText()).toContain('date_from=2026-11-01'))
    const callsBeforeTyping = eventRequests(fetchMock).length

    fireEvent.change(input, { target: { value: '0211' } })
    expect(fieldNotice()).toBeNull()
    fireEvent.focusOut(input)

    await waitFor(() =>
      expect(fieldNotice()?.textContent).toBe(
        'Введите дату полностью. Действует прежний фильтр: 01.11.2026.',
      ),
    )
    expect(locationText()).toContain('date_from=2026-11-01')
    expect(eventRequests(fetchMock)).toHaveLength(callsBeforeTyping)
  })

  it('clears the applied filter and the message when the field is emptied', async () => {
    setup()
    await screen.findByText('Создал сборку #28')
    const input = dateFromInput()

    fireEvent.change(input, { target: { value: '01112026' } })
    await waitFor(() => expect(locationText()).toContain('date_from=2026-11-01'))
    fireEvent.change(input, { target: { value: '31022026' } })
    await waitFor(() => expect(fieldNotice()).not.toBeNull())

    fireEvent.change(input, { target: { value: '' } })
    await waitFor(() => expect(locationText()).not.toContain('date_from'))
    expect(input.value).toBe('')
    expect(fieldNotice()).toBeNull()
  })

  it('writes the picked calendar day into the text field and the filter', async () => {
    const fetchMock = setup()
    await screen.findByText('Создал сборку #28')
    const input = dateFromInput()

    // The value in the URL decides which month the calendar opens on.
    fireEvent.change(input, { target: { value: '01112026' } })
    await waitFor(() => expect(locationText()).toContain('date_from=2026-11-01'))
    fireEvent.click(input)

    const secondDay = await waitFor(() => {
      const days = [...document.querySelectorAll('.react-datepicker__day--002')]
        .filter((day) => !day.classList.contains('react-datepicker__day--outside-month'))
      expect(days.length).toBeGreaterThan(0)
      return days[0]
    })
    fireEvent.click(secondDay)

    await waitFor(() => expect(input.value).toBe('02.11.2026'))
    await waitFor(() => expect(eventRequests(fetchMock).at(-1)?.get('date_from')).toBe('2026-11-02'))
    expect(fieldNotice()).toBeNull()
  })

  it('resets both text fields together with the date filters', async () => {
    setup()
    await screen.findByText('Создал сборку #28')
    fireEvent.change(dateFromInput(), { target: { value: '01112026' } })
    fireEvent.change(dateToInput(), { target: { value: '30112026' } })
    await waitFor(() => expect(locationText()).toContain('date_to=2026-11-30'))

    // A pending invalid draft must not survive the reset either.
    fireEvent.change(dateFromInput(), { target: { value: '31022026' } })
    await waitFor(() => expect(fieldNotice()).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }))

    await waitFor(() => expect(dateFromInput().value).toBe(''))
    expect(dateToInput().value).toBe('')
    expect(fieldNotice()).toBeNull()
    expect(dateFromInput().getAttribute('aria-invalid')).toBeNull()
    const location = locationText()
    expect(location).not.toContain('date_from')
    expect(location).not.toContain('date_to')
  })

  it('keeps the text fields in step with the URL-driven state', async () => {
    setup()
    await screen.findByText('Создал сборку #28')
    fireEvent.change(dateFromInput(), { target: { value: '01112026' } })
    await waitFor(() => expect(dateFromInput().value).toBe('01.11.2026'))

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }))
    await waitFor(() => expect(dateFromInput().value).toBe(''))
    fireEvent.change(dateFromInput(), { target: { value: '05052026' } })
    await waitFor(() => expect(dateFromInput().value).toBe('05.05.2026'))
    expect(locationText()).toContain('date_from=2026-05-05')
  })

  it('follows browser history back to the applied state and drops the invalid draft', async () => {
    setup()
    await screen.findByText('Создал сборку #28')
    const input = dateFromInput()

    fireEvent.change(input, { target: { value: '01112026' } })
    await waitFor(() => expect(locationText()).toContain('date_from=2026-11-01'))
    fireEvent.change(input, { target: { value: '31022026' } })
    await waitFor(() => expect(fieldNotice()).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'История назад' }))

    await waitFor(() => expect(locationText()).not.toContain('date_from'))
    expect(input.value).toBe('')
    expect(fieldNotice()).toBeNull()
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
      // Administrators and the owner keep a compact role marker in the same cell.
      ['AdminMaster · Администратор', '42'],
      ['owner · Владелец', '1'],
      // Deleted accounts: the recorded snapshot is shown, never a made-up name.
      ['DeletedIvan', '56'],
      // The fallback label already states the role, so it is not repeated.
      ['Администратор (недоступен)', '57'],
      // System-generated events have no actor and no id.
      ['Система', '—'],
    ])
    // The unknown-actor label stays reserved for failed authentication.
    expect(screen.queryByText('Неизвестный')).toBeNull()
  })

  it('adds no role noise for ordinary users and keeps the numeric id separate', async () => {
    setup(eventsActorFixture)
    const row = (await screen.findByText('Создал сборку #28')).closest('tr') as HTMLElement
    const cells = within(row).getAllByRole('cell')
    expect(cells[1]?.textContent).toBe('IvanCool')
    expect(cells[2]?.textContent).toBe('104')
    expect(cells[1]?.textContent).not.toContain('Пользователь')
  })

  it('localizes the actor role markers in English', async () => {
    await act(async () => { await i18n.changeLanguage('en') })
    setup(eventsActorFixture)
    await screen.findByText('Created a build #28')
    const actors = tableRows().map((cells) => cells[1])
    expect(actors[0]).toBe('IvanCool')
    expect(actors[1]).toBe('AdminMaster · Administrator')
    expect(actors[2]).toBe('owner · Owner')
    expect(actors[3]).toBe('DeletedIvan')
    expect(actors[4]).toBe('Administrator (unavailable)')
    expect(actors[5]).toBe('System')
    const headers = Array.from(document.querySelectorAll('table thead th')).map((cell) => cell.textContent)
    expect(headers).toEqual(['Time', 'Username', 'User ID', 'Event', 'Outcome'])
  })
})
