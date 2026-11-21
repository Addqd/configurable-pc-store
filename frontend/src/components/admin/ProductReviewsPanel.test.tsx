import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { ProductReviewsPanel } from './ProductReviewsPanel'
import { render } from '../../test-utils'
import {
  callsTo, jsonResponse, noContent, requestBody, reviewFixture, reviewsPageFixture, stubAdminFetch,
} from '../../test-admin-api'

function setup() {
  const handler = (url: URL, init: RequestInit) => {
    const method = init.method ?? 'GET'
    if (url.pathname === '/api/v1/admin/reviews' && method === 'GET') return jsonResponse(reviewsPageFixture())
    if (url.pathname === '/api/v1/admin/products/7/reviews' && method === 'POST') {
      return jsonResponse({ ...reviewFixture, id: 90, source: 'admin', user_id: null, author_name: 'Новый клиент', reviewer_name: 'Новый клиент' }, 201)
    }
    if (url.pathname === '/api/v1/admin/reviews/1' && method === 'PATCH') {
      const body = requestBody(init) as Record<string, unknown>
      return jsonResponse({ ...reviewFixture, ...body })
    }
    if (url.pathname === '/api/v1/admin/reviews/1' && method === 'DELETE') return noContent()
    return undefined
  }
  const fetchMock = stubAdminFetch({ handler })
  render(<ProductReviewsPanel productId={7} />)
  return fetchMock
}

/** The editor is a real dialog overlay, not an inline panel above the table. */
const editorDialog = () => screen.getByRole('dialog')

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('product review administration', () => {
  it('opens the creation form inside a modal dialog with current date/time, no delete and the required primary label', async () => {
    setup()
    await screen.findByText('Клиент 1')
    fireEvent.click(screen.getByRole('button', { name: 'Добавить отзыв' }))

    const editor = editorDialog()
    expect(editor.getAttribute('aria-modal')).toBe('true')
    expect(within(editor).getByRole('heading', { name: 'Добавление отзыва' })).toBeTruthy()
    expect((within(editor).getByLabelText('Имя клиента') as HTMLInputElement).value).toBe('')
    expect((within(editor).getByLabelText('Текст отзыва') as HTMLTextAreaElement).value).toBe('')
    expect(within(editor).getByText('0 из 5')).toBeTruthy()
    expect((within(editor).getByLabelText('Дата') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect((within(editor).getByLabelText('Время') as HTMLInputElement).value).toMatch(/^\d{2}:\d{2}$/)
    expect(within(editor).getByRole('button', { name: 'Добавить отзыв' })).toBeTruthy()
    expect(within(editor).queryByRole('button', { name: 'Удалить отзыв' })).toBeNull()
    expect(within(editor).getByLabelText('Имя клиента').getAttribute('aria-required')).toBe('true')
    expect(within(editor).getByRole('radiogroup').getAttribute('aria-required')).toBe('true')
  })

  it('creates an administrative review with the submitted values', async () => {
    const fetchMock = setup()
    await screen.findByText('Клиент 1')
    fireEvent.click(screen.getByRole('button', { name: 'Добавить отзыв' }))
    const editor = editorDialog()

    fireEvent.change(within(editor).getByLabelText('Имя клиента'), { target: { value: 'Новый клиент' } })
    fireEvent.click(within(editor).getByRole('radio', { name: 'Оценка 5 из 5' }))
    fireEvent.change(within(editor).getByLabelText('Текст отзыва'), { target: { value: 'Всё отлично!' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Добавить отзыв' }))

    expect(await screen.findByText('Отзыв добавлен')).toBeTruthy()
    const post = callsTo(fetchMock, '/api/v1/admin/products/7/reviews').find(([, init]) => init.method === 'POST')
    const body = requestBody(post?.[1] ?? {}) as Record<string, unknown>
    expect(body.author_name).toBe('Новый клиент')
    expect(body.rating).toBe(5)
    expect(body.body).toBe('Всё отлично!')
    expect(body.is_published).toBe(true)
    expect(body.store_reply).toBeNull()
    expect(typeof body.displayed_at).toBe('string')
  })

  it('populates edit mode, locks customer content and keeps the stored timestamp when it was not edited', async () => {
    const fetchMock = setup()
    await screen.findByText('Клиент 1')
    fireEvent.click(screen.getAllByRole('button', { name: 'Изменить' })[0])

    const editor = editorDialog()
    expect((within(editor).getByLabelText('Имя клиента') as HTMLInputElement).value).toBe('Клиент 1')
    expect((within(editor).getByLabelText('Имя клиента') as HTMLInputElement).disabled).toBe(true)
    expect((within(editor).getByLabelText('Текст отзыва') as HTMLTextAreaElement).disabled).toBe(true)
    expect(within(editor).getByText(/Отзыв написан клиентом/)).toBeTruthy()
    expect(within(editor).getByRole('button', { name: 'Удалить отзыв' })).toBeTruthy()

    fireEvent.change(within(editor).getByLabelText('Ответ магазина'), { target: { value: 'Новый ответ' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Сохранить изменения' }))

    expect(await screen.findByText('Изменения отзыва сохранены')).toBeTruthy()
    const patch = callsTo(fetchMock, '/api/v1/admin/reviews/1').find(([, init]) => init.method === 'PATCH')
    const body = requestBody(patch?.[1] ?? {}) as Record<string, unknown>
    // `displayed_at` is omitted so the stored seconds survive an unrelated edit.
    expect(Object.keys(body).sort()).toEqual(['is_published', 'store_reply'])
    expect(body.store_reply).toBe('Новый ответ')
    expect(body.is_published).toBe(true)
  })

  it('sends the new timestamp when the date or time control was changed', async () => {
    const fetchMock = setup()
    await screen.findByText('Клиент 1')
    fireEvent.click(screen.getAllByRole('button', { name: 'Изменить' })[0])

    const editor = editorDialog()
    fireEvent.change(within(editor).getByLabelText('Время'), { target: { value: '09:15' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Сохранить изменения' }))

    await waitFor(() => expect(callsTo(fetchMock, '/api/v1/admin/reviews/1').some(([, init]) => init.method === 'PATCH')).toBe(true))
    const patch = callsTo(fetchMock, '/api/v1/admin/reviews/1').find(([, init]) => init.method === 'PATCH')
    const body = requestBody(patch?.[1] ?? {}) as Record<string, unknown>
    expect(typeof body.displayed_at).toBe('string')
    const sent = new Date(body.displayed_at as string)
    expect(sent.getHours()).toBe(9)
    expect(sent.getMinutes()).toBe(15)
  })

  it('deletes only after confirming in the shared deletion modal', async () => {
    const fetchMock = setup()
    await screen.findByText('Клиент 1')
    fireEvent.click(screen.getAllByRole('button', { name: 'Изменить' })[0])
    const editor = editorDialog()
    fireEvent.click(within(editor).getByRole('button', { name: 'Удалить отзыв' }))

    expect(screen.getByRole('heading', { name: 'Удалить отзыв?' })).toBeTruthy()
    expect(screen.getByText(/Этот отзыв будет безвозвратно удалён/)).toBeTruthy()
    expect(callsTo(fetchMock, '/api/v1/admin/reviews/1').some(([, init]) => init.method === 'DELETE')).toBe(false)

    // The confirmation is the topmost dialog; the editor stays underneath it.
    const confirmation = screen.getAllByRole('dialog').at(-1) as HTMLElement
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Удалить' }))
    expect(await screen.findByText('Отзыв удалён')).toBeTruthy()
    await waitFor(() => {
      expect(callsTo(fetchMock, '/api/v1/admin/reviews/1').some(([, init]) => init.method === 'DELETE')).toBe(true)
    })
  })
})
