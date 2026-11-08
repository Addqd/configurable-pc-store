import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { render } from '../test-utils'
import { useAccountStore } from '../stores/accountStore'
import { SavesPage } from './SavesPage'

vi.mock('../components/Header', () => ({ Header: () => <div /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div /> }))
vi.mock('../components/BackButton', () => ({ BackButton: () => <div /> }))
const data = { id: 42, user_id: 7, name: 'Private build', description: '', version: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', items: [] }
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })
beforeEach(() => { useAccountStore.setState({ accounts: {}, activeAccountId: null }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('private saved builds', () => {
  it('does not fetch private builds for a guest', () => {
    const mock = vi.fn(); vi.stubGlobal('fetch', mock)
    render(<MemoryRouter><SavesPage /></MemoryRouter>)
    expect(screen.getByText('Мои сборки')).toBeTruthy()
    expect(mock).not.toHaveBeenCalled()
  })
  it('disables cart for unknown compatibility and deletes only after confirmation', async () => {
    useAccountStore.setState({ activeAccountId: '7', accounts: { '7': { account: { id: '7', username: 'test', email: 'test@example.com', displayName: 'Test', avatar: '', createdAt: 0 } } } })
    let deleted = false
    const mock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/compatibility')) return json({ build_id: 42, overall_status: 'unknown', items: [] })
      if (url.endsWith('/42') && init.method === 'DELETE') { deleted = true; return new Response(null, { status: 204 }) }
      return json(deleted ? [] : [data])
    })
    vi.stubGlobal('fetch', mock)
    render(<MemoryRouter><SavesPage /></MemoryRouter>)
    await screen.findByText('Private build')
    await waitFor(() => expect((screen.getByRole('button', { name: /В корзину/i }) as HTMLButtonElement).disabled).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: /Удалить.*Private build/i }))
    const dialog = screen.getByRole('alertdialog')
    expect(deleted).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: /Удалить/i }))
    await waitFor(() => expect(deleted).toBe(true))
    await waitFor(() => expect(screen.queryByText('Private build')).toBeNull())
  })
})
