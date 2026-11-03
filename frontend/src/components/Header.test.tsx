import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Header } from './Header'
import { useUIStore } from '../stores/uiStore'
import { useCartStore } from '../stores/cartStore'
import { useAccountStore } from '../stores/accountStore'

vi.mock('react-icons/fi', () => ({
  FiMenu: () => <div data-testid="fi-menu" />,
  FiSearch: () => <div data-testid="fi-search" />,
  FiShoppingCart: () => <div data-testid="fi-cart" />,
  FiChevronDown: () => <div data-testid="fi-chevron-down" />,
  FiX: () => <div data-testid="fi-x" />,
}))
vi.mock('react-icons/hi2', () => ({ HiMiniChevronRight: () => <div data-testid="hi-chevron" /> }))
vi.mock('./SearchDropdown', () => ({ SearchDropdown: () => <div data-testid="search-dropdown" /> }))
vi.mock('./ProfileDropdown', () => ({ ProfileDropdown: () => <div data-testid="profile-dropdown" /> }))
vi.mock('./NavigationMenu', () => ({ NavigationMenu: () => <div data-testid="navigation-menu" /> }))
vi.mock('../assets/home/logo-pc-builder.png', () => ({ default: 'mock-logo.png' }))
vi.mock('../assets/placeholder.jpg', () => ({ default: 'mock-placeholder.jpg' }))

describe('Header', () => {
  beforeEach(() => {
    cleanup()
    useUIStore.setState({ navOpen: false, searchOpen: false, profileOpen: false, authModalOpen: false, searchQuery: '' })
    useAccountStore.setState({ accounts: {}, activeAccountId: null })
    useCartStore.setState({ items: [], orders: [], favorites: [], nextOrderId: 1, activeAccountId: null })
  })
  const renderHeader = () => render(<MemoryRouter><Header /></MemoryRouter>)

  it('renders the hamburger, logo, search, cart and profile controls', () => {
    renderHeader()
    expect(screen.getByLabelText('Открыть меню')).toBeTruthy()
    expect(screen.getByAltText('PC Builder')).toBeTruthy()
    expect(screen.getByPlaceholderText(/поиск комплектующих/i)).toBeTruthy()
    expect(screen.getByLabelText('Корзина')).toBeTruthy()
    expect(screen.getByLabelText('Профиль')).toBeTruthy()
  })

  it('opens and closes navigation', () => {
    renderHeader()
    fireEvent.click(screen.getByLabelText('Открыть меню'))
    expect(screen.getByTestId('navigation-menu')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Открыть меню'))
    expect(screen.queryByTestId('navigation-menu')).toBeNull()
  })

  it('opens login instead of pretending a guest is authenticated', () => {
    renderHeader()
    fireEvent.click(screen.getByLabelText('Профиль'))
    expect(useUIStore.getState().authModalOpen).toBe(true)
    expect(useUIStore.getState().authModalMode).toBe('login')
    expect(screen.queryByTestId('profile-dropdown')).toBeNull()
  })

  it('opens the profile dropdown for an authenticated account', () => {
    useAccountStore.setState({
      activeAccountId: 'id1',
      accounts: {
        id1: { account: { id: 'id1', email: 'a@b.com', username: 'demo', displayName: 'Demo', avatar: '', createdAt: 1 },
          password: { salt: 'salt', hash: 'hash' } },
      },
    })
    renderHeader()
    fireEvent.click(screen.getByLabelText('Профиль'))
    expect(screen.getByTestId('profile-dropdown')).toBeTruthy()
  })

  it('shows a cart badge when items exist', () => {
    useCartStore.getState().addItem({ id: 1, name: 'Test', price: 1000, image: '', specs: [], category: 'Test' })
    renderHeader()
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('shows and closes the search dropdown', () => {
    renderHeader()
    const search = screen.getByPlaceholderText(/поиск комплектующих/i)
    fireEvent.focus(search)
    fireEvent.change(search, { target: { value: 'rtx' } })
    expect(screen.getByTestId('search-dropdown')).toBeTruthy()
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(screen.queryByTestId('search-dropdown')).toBeNull()
  })
})
