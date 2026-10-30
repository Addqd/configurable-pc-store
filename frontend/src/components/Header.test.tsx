import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Header } from './Header'
import { useUIStore } from '../stores/uiStore'
import { useCartStore } from '../stores/cartStore'

// Mock react-icons
vi.mock('react-icons/fi', () => ({
  FiMenu: () => <div data-testid="fi-menu" />,
  FiSearch: () => <div data-testid="fi-search" />,
  FiShoppingCart: () => <div data-testid="fi-cart" />,
  FiChevronDown: () => <div data-testid="fi-chevron-down" />,
  FiX: () => <div data-testid="fi-x" />,
}))

vi.mock('react-icons/hi2', () => ({
  HiMiniChevronRight: () => <div data-testid="hi-chevron" />,
}))

vi.mock('./SearchDropdown', () => ({ SearchDropdown: () => <div data-testid="search-dropdown" /> }))
vi.mock('./ProfileDropdown', () => ({ ProfileDropdown: () => <div data-testid="profile-dropdown" /> }))
vi.mock('./NavigationMenu', () => ({ NavigationMenu: () => <div data-testid="navigation-menu" /> }))
vi.mock('../assets/home/logo-pc-builder.png', () => ({ default: 'mock-logo.png' }))
vi.mock('../assets/placeholder.jpg', () => ({ default: 'mock-placeholder.jpg' }))

describe('Header component', () => {
  beforeEach(() => {
    useUIStore.getState().closeNav()
    useUIStore.getState().closeSearch()
    useUIStore.getState().closeProfile()
    useUIStore.getState().setSearchQuery('')
    useCartStore.getState().clear()
    cleanup()
  })

  it('renders hamburger button', () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    expect(screen.getByLabelText('Открыть меню')).toBeTruthy()
    expect(screen.getByLabelText('Открыть меню').querySelector('[data-testid="fi-menu"]')).toBeTruthy()
  })

  it('renders logo', () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    expect(screen.getByAltText('PC Builder')).toBeTruthy()
  })

  it('renders search input with correct placeholder', () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    const input = screen.getByPlaceholderText(/поиск комплектующих/i)
    expect(input).toBeTruthy()
  })

  it('renders cart link', () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    expect(screen.getByLabelText('Корзина')).toBeTruthy()
  })

  it('renders profile button', () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    expect(screen.getByLabelText('Профиль')).toBeTruthy()
  })

  it('toggles navigation menu on hamburger click', () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    const btn = screen.getByLabelText('Открыть меню')
    fireEvent.click(btn)
    expect(screen.getByTestId('navigation-menu')).toBeTruthy()
    fireEvent.click(btn)
    expect(screen.queryByTestId('navigation-menu')).toBeNull()
  })

  it('toggles profile dropdown on profile click', () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    const btn = screen.getByLabelText('Профиль')
    fireEvent.click(btn)
    expect(screen.getByTestId('profile-dropdown')).toBeTruthy()
  })

  it('shows cart badge when items exist', () => {
    useCartStore.getState().addItem({
      id: 1, name: 'Test', price: 1000, image: 'test.jpg'
    })
    render(<MemoryRouter><Header /></MemoryRouter>)
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('hides cart badge when cart is empty', () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    expect(screen.queryByText('1')).toBeNull()
  })

  it('shows search dropdown on input focus with text', () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    const input = screen.getByPlaceholderText(/поиск/i)
    fireEvent.focus(input)
    fireEvent.input(input, { target: { value: 'rtx' } })
    expect(screen.queryByTestId('search-dropdown')).toBeTruthy()
  })

  it('closes search on Escape key', () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    const input = screen.getByPlaceholderText(/поиск/i)
    fireEvent.focus(input)
    fireEvent.input(input, { target: { value: 'rtx' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('search-dropdown')).toBeNull()
  })

  it('shows search results when typing', () => {
    render(<MemoryRouter><Header /></MemoryRouter>)
    const input = screen.getByPlaceholderText(/поиск/i)
    fireEvent.focus(input)
    fireEvent.input(input, { target: { value: 'rtx' } })
    expect(screen.getByTestId('search-dropdown')).toBeTruthy()
  })
})
