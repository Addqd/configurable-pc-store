import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { MemoryRouter } from 'react-router'
import { AccountPage } from './AccountPage'
import { useAccountStore } from '../stores/accountStore'
import { useCartStore } from '../stores/cartStore'

vi.stubGlobal('crypto', webcrypto)
vi.mock('../components/Header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div data-testid="footer" /> }))

afterEach(() => cleanup())
beforeEach(() => {
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
  useCartStore.setState({ activeAccountId: null, items: [], orders: [], favorites: [], nextOrderId: 1 })
})

describe('account page session isolation', () => {
  it('discards unsaved personal data, passwords and delete confirmation on account switch', async () => {
    await act(async () => {
      expect((await useAccountStore.getState().register('first@example.test', 'first', 'First User', 'Password123')).success).toBe(true)
    })
    render(<MemoryRouter><AccountPage /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Unsaved secret name' } })
    fireEvent.change(screen.getByLabelText('Текущий пароль'), { target: { value: 'old-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Удалить профиль' }))
    expect(screen.getByRole('button', { name: 'Да, удалить' })).toBeTruthy()

    await act(async () => {
      useAccountStore.getState().logout()
      expect((await useAccountStore.getState().register('second@example.test', 'second', 'Second User', 'Password456')).success).toBe(true)
    })

    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Second User')
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('second@example.test')
    expect((screen.getByLabelText('Текущий пароль') as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Да, удалить' })).toBeNull()
    expect(screen.queryByDisplayValue('Unsaved secret name')).toBeNull()
  })
})
