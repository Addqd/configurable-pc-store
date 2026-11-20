import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { ProductReviewsPanel } from './ProductReviewsPanel'
import { render } from '../../test-utils'
import { jsonResponse, reviewFixture, reviewsPageFixture, stubAdminFetch } from '../../test-admin-api'

/**
 * Renders the editor inline (unlike the real dialog) so several editor sessions
 * can be opened in one test: it lets us replay the completion of a slow mutation
 * that belongs to an editor which is no longer the active one.
 */
const { sessions } = vi.hoisted(() => ({
  sessions: [] as {
    review: { id: number } | null
    onClose: () => void
    onSaved: (message: string) => void
    onDeleted: () => void
  }[],
}))

vi.mock('./ReviewEditor', () => ({
  ReviewEditor: (props: {
    review: { id: number } | null
    onClose: () => void
    onSaved: (message: string) => void
    onDeleted: () => void
  }) => {
    sessions.push(props)
    return (
      <div data-testid="fake-editor">
        <span>{props.review ? `editing-${props.review.id}` : 'creating'}</span>
        <input aria-label="unsaved-note" defaultValue="" />
      </div>
    )
  },
}))

function setup() {
  const fetchMock = stubAdminFetch({
    handler: (url) => {
      if (url.pathname === '/api/v1/admin/reviews') return jsonResponse(reviewsPageFixture())
      return undefined
    },
  })
  render(<ProductReviewsPanel productId={7} />)
  return fetchMock
}

const editButtons = () => screen.getAllByRole('button', { name: 'Изменить' })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  sessions.length = 0
})

describe('review editor completion races', () => {
  it('does not close a newer editor when an older editor finishes its mutation', async () => {
    setup()
    await screen.findByText(reviewFixture.reviewer_name)

    fireEvent.click(editButtons()[0])
    expect(screen.getByText(`editing-${reviewFixture.id}`)).toBeTruthy()
    const firstSession = sessions.at(-1)
    if (!firstSession) throw new Error('first editor session missing')

    // A second editor is opened for another review and gets unsaved input.
    fireEvent.click(editButtons()[1])
    expect(screen.getByText('editing-5')).toBeTruthy()
    const note = screen.getByLabelText('unsaved-note') as HTMLInputElement
    fireEvent.change(note, { target: { value: 'черновик для второго отзыва' } })

    // The slow mutation of the first editor completes now.
    act(() => {
      firstSession.onSaved('Изменения отзыва сохранены')
      firstSession.onClose()
    })

    expect(screen.getByText('editing-5')).toBeTruthy()
    expect((screen.getByLabelText('unsaved-note') as HTMLInputElement).value).toBe('черновик для второго отзыва')
  })
})
