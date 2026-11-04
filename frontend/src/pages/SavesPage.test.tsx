import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import {
  useBuilderStore, emptyBuilderSelections, getProductsForCategory,
  calculateBuilderPrice, selectionsFromSavedBuild, type BuilderSelections,
} from '../stores/builderStore'
import { useCartStore } from '../stores/cartStore'
import { useAccountStore } from '../stores/accountStore'
import { SavesPage } from './SavesPage'

vi.mock('../components/Header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div data-testid="footer" /> }))
vi.mock('../components/BackButton', () => ({ BackButton: () => <div data-testid="back" /> }))

function complete(): BuilderSelections {
  return {
    cpu: getProductsForCategory('cpu').find((p) => p.name.includes('7800X3D'))!,
    mobo: getProductsForCategory('mobo').find((p) => p.name.includes('B650 Tomahawk'))!,
    gpu: getProductsForCategory('gpu')[0],
    ram: getProductsForCategory('ram')[0],
    storage: getProductsForCategory('storage')[0],
    psu: getProductsForCategory('psu')[0],
    case: getProductsForCategory('case')[0],
    cooling: getProductsForCategory('cooling')[0],
  }
}

function mockSignedIn(id: string) {
  useAccountStore.setState({
    activeAccountId: id,
    accounts: {
      [id]: {
        account: { id, email: `${id}@example.test`, username: id, displayName: id, avatar: '', createdAt: Date.now() },
        password: { salt: 'test', hash: 'test' },
      },
    },
  })
  useCartStore.getState().setActiveAccountId(id)
}

beforeEach(() => {
  useBuilderStore.setState({
    selections: emptyBuilderSelections(), savedBuilds: [], nextSavedBuildId: 1, editingBuildId: null,
  })
  useCartStore.setState({ items: [], orders: [], favorites: [], nextOrderId: 1, activeAccountId: null })
  useAccountStore.setState({ accounts: {}, activeAccountId: null })
})
afterEach(() => cleanup())

describe('TASK 007 — real saved-build lifecycle', () => {
  it('does not save incomplete drafts and does not create a bogus id=0 record', () => {
    expect(useBuilderStore.getState().saveBuild('Incomplete', '', '', 'user-a')).toBeNull()
    expect(useBuilderStore.getState().savedBuilds).toHaveLength(0)
    expect(useBuilderStore.getState().nextSavedBuildId).toBe(1)
  })

  it('saves eight products, real prices and a deep snapshot that survives later draft changes', () => {
    const selections = complete()
    useBuilderStore.setState({ selections })
    const expected = calculateBuilderPrice(selections)
    const saved = useBuilderStore.getState().saveBuild('Workstation', 'Description', '', 'user-a')!
    expect(saved.id).toBe(1)
    expect(saved.totalPrice).toBe(expected)
    expect(saved.components).toHaveLength(8)
    expect(saved.ownerId).toBe('user-a')
    expect(saved.selections?.cpu?.id).toBe(selections.cpu!.id)
    expect(saved.selections?.gpu?.price).toBe(selections.gpu!.price)
    expect(saved.version).toBe(1)
    const initialName = saved.selections!.gpu!.name
    useBuilderStore.getState().setProduct('gpu', getProductsForCategory('gpu')[1])
    expect(saved.selections!.gpu!.name).toBe(initialName)
  })

  it('restores the actual catalog product prices and updates the SAME build after editing', () => {
    const original = complete()
    useBuilderStore.setState({ selections: original })
    const saved = useBuilderStore.getState().saveBuild('First', '', '', 'user-a')!
    const oldPrice = saved.totalPrice
    useBuilderStore.getState().clearAll()
    expect(useBuilderStore.getState().restoreBuild(saved.id, 'user-a')).toBe(true)
    expect(useBuilderStore.getState().selections.cpu!.price).toBe(original.cpu!.price)
    expect(useBuilderStore.getState().selections.cpu!.id).toBe(original.cpu!.id)
    expect(useBuilderStore.getState().selections.cpu!.category).toBe('Процессоры')
    expect(calculateBuilderPrice(useBuilderStore.getState().selections)).toBe(oldPrice)
    useBuilderStore.getState().setProduct('gpu', getProductsForCategory('gpu')[1])
    const modifiedPrice = calculateBuilderPrice(useBuilderStore.getState().selections)
    const updated = useBuilderStore.getState().saveBuild('Updated', 'Edited', '', 'user-a')!
    expect(updated.id).toBe(saved.id)
    expect(updated.savedAt).toBe(saved.savedAt)
    expect(updated.version).toBe(2)
    expect(updated.totalPrice).toBe(modifiedPrice)
    expect(useBuilderStore.getState().savedBuilds).toHaveLength(1)
  })

  it('refuses to restore or delete another account’s build', () => {
    useBuilderStore.setState({ selections: complete() })
    const build = useBuilderStore.getState().saveBuild('Private', '', '', 'user-a')!
    useBuilderStore.getState().clearAll()
    expect(useBuilderStore.getState().restoreBuild(build.id, 'user-b')).toBe(false)
    expect(useBuilderStore.getState().deleteSavedBuild(build.id, 'user-b')).toBe(false)
    expect(useBuilderStore.getState().getSavedBuild(build.id, 'user-b')).toBeUndefined()
    expect(useBuilderStore.getState().saveBuildsForAccount('user-b')).toEqual([])
    expect(useBuilderStore.getState().savedBuilds).toHaveLength(1)
    expect(useBuilderStore.getState().selections.cpu).toBeNull()
  })

  it('restores first-version legacy builds by exact matching names, without zero-price fake products', () => {
    useBuilderStore.setState({ selections: complete() })
    const saved = useBuilderStore.getState().saveBuild('Legacy', '', '', 'user-a')!
    useBuilderStore.setState({ savedBuilds: [{ ...saved, selections: undefined }], editingBuildId: null })
    useBuilderStore.getState().clearAll()
    expect(useBuilderStore.getState().restoreBuild(saved.id, 'user-a')).toBe(true)
    expect(calculateBuilderPrice(useBuilderStore.getState().selections)).toBe(saved.totalPrice)
    expect(useBuilderStore.getState().selections.gpu!.category).toBe('Видеокарты')
  })

  it('rejects a legacy build with missing catalog products rather than silently restoring junk', () => {
    useBuilderStore.setState({ selections: complete() })
    const saved = useBuilderStore.getState().saveBuild('Broken', '', '', 'user-a')!
    const broken = { ...saved, selections: undefined,
      components: saved.components.map((component) => component.category === 'Процессор' ? { ...component, name: 'MISSING PRODUCT' } : component) }
    expect(selectionsFromSavedBuild(broken)).toBeNull()
    useBuilderStore.setState({ savedBuilds: [broken], selections: emptyBuilderSelections(), editingBuildId: null })
    expect(useBuilderStore.getState().restoreBuild(saved.id, 'user-a')).toBe(false)
  })

  it('rehydrates saved builds from the actual persisted browser storage', async () => {
    useBuilderStore.setState({ selections: complete() })
    useBuilderStore.getState().saveBuild('Persistent', '', '', 'user-a')
    const persisted = localStorage.getItem('pc-builder-saved')!
    expect(persisted).toContain('Persistent')
    useBuilderStore.setState({ savedBuilds: [], editingBuildId: null, selections: emptyBuilderSelections() })
    localStorage.setItem('pc-builder-saved', persisted)
    await useBuilderStore.persist.rehydrate()
    expect(useBuilderStore.getState().savedBuilds).toHaveLength(1)
    expect(useBuilderStore.getState().savedBuilds[0].name).toBe('Persistent')
  })

  it('cleans all saved builds of a deleted account and preserves other accounts’ records', () => {
    useBuilderStore.setState({ selections: complete() })
    const owned = useBuilderStore.getState().saveBuild('Delete with A', '', '', 'user-a')!
    useBuilderStore.getState().startNewBuild()
    useBuilderStore.setState({ selections: complete() })
    const other = useBuilderStore.getState().saveBuild('Keep for B', '', '', 'user-b')!
    mockSignedIn('user-a')
    expect(useAccountStore.getState().deleteAccount()).toBe(true)
    expect(useBuilderStore.getState().getSavedBuild(owned.id, 'user-a')).toBeUndefined()
    expect(useBuilderStore.getState().getSavedBuild(other.id, 'user-b')?.name).toBe('Keep for B')
  })

  it('adds saved builds as one cart item, with revision-specific IDs and no double counting', () => {
    useBuilderStore.setState({ selections: complete() })
    const saved = useBuilderStore.getState().saveBuild('Cart PC', '', '', 'user-a')!
    const selections = selectionsFromSavedBuild(saved)!
    // Use the same payload contract as SavesPage; components form a single cart item.
    useCartStore.getState().addBuild({ id: -1000010001, name: saved.name, price: saved.totalPrice,
      image: saved.image, description: saved.description, components: saved.components, category: 'Готовые сборки', specs: '' })
    expect(selections.cpu).not.toBeNull()
    expect(useCartStore.getState().totalItems()).toBe(1)
    expect(useCartStore.getState().totalPrice()).toBe(saved.totalPrice)
    expect(useCartStore.getState().items[0]).toHaveProperty('components')
  })
})

describe('SavesPage user-visible behavior', () => {
  it('renders the reference-like expanded component list and requests explicit deletion confirmation', () => {
    mockSignedIn('user-a')
    useBuilderStore.setState({ selections: complete() })
    useBuilderStore.getState().saveBuild('My Gaming Build', 'For games', '', 'user-a')
    render(<MemoryRouter><SavesPage /></MemoryRouter>)
    expect(screen.getByText('My Gaming Build')).toBeTruthy()
    expect(screen.getByText('Состав сборки')).toBeTruthy()
    expect(screen.getByText('For games')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Удалить сборку My Gaming Build/i }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(useBuilderStore.getState().savedBuilds).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(useBuilderStore.getState().savedBuilds).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Удалить сборку My Gaming Build/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(useBuilderStore.getState().savedBuilds).toHaveLength(0)
  })

  it('does not reveal saved builds when logged out or signed in as another account', () => {
    useBuilderStore.setState({ selections: complete() })
    useBuilderStore.getState().saveBuild('Alice secret configuration', '', '', 'user-a')
    mockSignedIn('user-b')
    render(<MemoryRouter><SavesPage /></MemoryRouter>)
    expect(screen.queryByText('Alice secret configuration')).toBeNull()
    expect(screen.getByText('Сборок пока нет')).toBeTruthy()
    act(() => useAccountStore.getState().logout())
    expect(screen.queryByText('Alice secret configuration')).toBeNull()
    expect(screen.getByText('Войдите в аккаунт, чтобы увидеть свои сборки.')).toBeTruthy()
  })
})
