import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { BuilderPage } from './BuilderPage'
import { useBuilderStore, emptyBuilderSelections, getProductsForCategory, type BuilderSelections } from '../stores/builderStore'
import { useAccountStore } from '../stores/accountStore'
import { useUIStore } from '../stores/uiStore'

vi.mock('../components/Header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div data-testid="footer" /> }))
vi.mock('../components/BackButton', () => ({ BackButton: () => <div data-testid="back" /> }))
vi.mock('../components/BuilderComponentRow', () => ({ BuilderComponentRow: () => <div /> }))
vi.mock('../components/BuilderSidebar', () => ({ BuilderSidebar: () => <div data-testid="builder-sidebar" /> }))
vi.mock('../components/BuilderSpecsTable', () => ({ BuilderSpecsTable: () => <div /> }))

function complete(): BuilderSelections {
  return {
    cpu: getProductsForCategory('cpu').find((p) => p.name.includes('7800X3D'))!,
    mobo: getProductsForCategory('mobo').find((p) => p.name.includes('B650 Tomahawk'))!,
    gpu: getProductsForCategory('gpu')[0], ram: getProductsForCategory('ram')[0],
    storage: getProductsForCategory('storage')[0], psu: getProductsForCategory('psu')[0],
    case: getProductsForCategory('case')[0], cooling: getProductsForCategory('cooling')[0],
  }
}

beforeEach(() => {
  useBuilderStore.setState({ selections: emptyBuilderSelections(), savedBuilds: [], editingBuildId: null, nextSavedBuildId: 1 })
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
  useUIStore.setState({ authModalOpen: false, authModalMode: 'login' })
})
afterEach(() => cleanup())

function authenticate() {
  useAccountStore.setState({
    activeAccountId: 'me',
    accounts: {
      me: { account: { id: 'me', username: 'me', email: 'me@example.test', displayName: 'Me', avatar: '', createdAt: 1 },
        password: { salt: 'x', hash: 'x' } },
    },
  })
}

describe('BuilderPage — TASK 007 save integration', () => {
  it('keeps Save disabled for incomplete builds with a normal cursor', () => {
    authenticate()
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    const saveButton = screen.getByRole('button', { name: /Сохранить сборку/i }) as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)
    expect(saveButton.className).toContain('disabled:cursor-default')
    expect(screen.getByText(/Выберите комплектующие/i)).toBeTruthy()
  })

  it('saves a completed build through the real form and shows inline errors for invalid names', () => {
    authenticate()
    useBuilderStore.setState({ selections: complete() })
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    const button = screen.getByRole('button', { name: /Сохранить сборку/i }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(screen.getByRole('dialog')).toBeTruthy()
    const name = screen.getByLabelText('Название') as HTMLInputElement
    fireEvent.change(name, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(screen.getByRole('alert').textContent).toContain('Введите название')
    fireEvent.change(name, { target: { value: 'My Saved Build' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useBuilderStore.getState().savedBuilds[0].name).toBe('My Saved Build')
    expect(useBuilderStore.getState().savedBuilds[0].ownerId).toBe('me')
    expect(screen.getByRole('link', { name: 'Мои сборки' })).toBeTruthy()
  })

  it('updates the opened build instead of creating an unrelated duplicate', () => {
    authenticate()
    useBuilderStore.setState({ selections: complete() })
    const first = useBuilderStore.getState().saveBuild('Old name', '', '', 'me')!
    useBuilderStore.getState().restoreBuild(first.id, 'me')
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Сохранить сборку/i }))
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Old name')
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Updated name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(useBuilderStore.getState().savedBuilds).toHaveLength(1)
    expect(useBuilderStore.getState().savedBuilds[0].id).toBe(first.id)
    expect(useBuilderStore.getState().savedBuilds[0].name).toBe('Updated name')
  })

  it('opens authentication if a guest clicks Save instead of silently losing the draft', () => {
    useBuilderStore.setState({ selections: complete() })
    render(<MemoryRouter><BuilderPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Сохранить сборку/i }))
    expect(useUIStore.getState().authModalOpen).toBe(true)
    expect(useBuilderStore.getState().savedBuilds).toHaveLength(0)
  })
})
