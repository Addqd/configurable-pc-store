import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DeleteConfirmationModal, type DeleteConfirmationModalProps } from './DeleteConfirmationModal'

afterEach(() => cleanup())

function setup(overrides: Partial<DeleteConfirmationModalProps> = {}) {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  const props: DeleteConfirmationModalProps = {
    open: true,
    title: 'Удалить пользователя?',
    description: 'Вы собираетесь удалить аккаунт пользователя Иван (ID 104).',
    warning: 'Действие необратимо.',
    note: 'В журнале действий останется запись об удалении.',
    confirmLabel: 'Удалить навсегда',
    onCancel,
    onConfirm,
    ...overrides,
  }
  render(<DeleteConfirmationModal {...props} />)
  return { onCancel, onConfirm }
}

describe('DeleteConfirmationModal', () => {
  it('renders the shared destructive dialog content', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Удалить пользователя?' })).toBeTruthy()
    expect(screen.getByText(/аккаунт пользователя Иван/)).toBeTruthy()
    expect(screen.getByText('Действие необратимо.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Удалить навсегда' })).toBeTruthy()
  })

  it('never deletes before explicit confirmation', () => {
    const { onConfirm, onCancel } = setup()
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Удалить навсегда' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('blocks duplicate actions and closing while a request is pending', () => {
    const { onCancel, onConfirm } = setup({ pending: true })
    const cancel = screen.getByRole('button', { name: 'Отмена' }) as HTMLButtonElement
    const confirm = screen.getByRole('button', { name: 'Удаление…' }) as HTMLButtonElement
    expect(cancel.disabled).toBe(true)
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('shows a server error without closing', () => {
    setup({ error: 'Недостаточно прав для этого действия.' })
    expect(screen.getByRole('alert').textContent).toContain('Недостаточно прав')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('renders the same component with review-specific copy', () => {
    setup({
      title: 'Удалить отзыв?',
      description: 'Этот отзыв будет безвозвратно удалён.',
      warning: 'Действие необратимо. Восстановить отзыв не получится.',
      confirmLabel: 'Удалить',
    })
    expect(screen.getByRole('heading', { name: 'Удалить отзыв?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeTruthy()
  })
})
