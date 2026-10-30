import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ProfileDropdown } from './ProfileDropdown'
import { useUIStore } from '../stores/uiStore'
import { useThemeStore } from '../stores/themeStore'

vi.mock('react-icons/fi', () => ({
  FiUser: () => <div data-testid="fi-user" />,
  FiBox: () => <div data-testid="fi-box" />,
  FiFileText: () => <div data-testid="fi-file" />,
  FiSettings: () => <div data-testid="fi-settings" />,
  FiLogOut: () => <div data-testid="fi-logout" />,
}))

vi.mock('react-icons/hi2', () => ({
  HiMiniMoon: () => <div data-testid="hi-moon" />,
  HiMiniSun: () => <div data-testid="hi-sun" />,
}))

describe('ProfileDropdown component', () => {
  const mockUser = {
    name: 'Анна Петрова',
    email: 'anna.petrova@mail.ru',
    avatar: '/placeholder.jpg',
  }

  beforeEach(() => {
    useThemeStore.setState({ isDark: false })
    cleanup()
  })

  it('renders user name and email', () => {
    render(<ProfileDropdown user={mockUser} />)
    expect(screen.getByText('Анна Петрова')).toBeTruthy()
    expect(screen.getByText('anna.petrova@mail.ru')).toBeTruthy()
  })

  it('renders user avatar image', () => {
    render(<ProfileDropdown user={mockUser} />)
    const avatar = screen.getByAltText('Анна Петрова')
    expect(avatar).toBeTruthy()
  })

  it('renders all menu items', () => {
    render(<ProfileDropdown user={mockUser} />)
    expect(screen.getByText('Личный кабинет')).toBeTruthy()
    expect(screen.getByText('Мои сборки')).toBeTruthy()
    expect(screen.getByText('Мои заказы')).toBeTruthy()
    expect(screen.getByText('Настройки')).toBeTruthy()
  })

  it('renders dark theme toggle', () => {
    render(<ProfileDropdown user={mockUser} />)
    expect(screen.getByText('Тёмная тема')).toBeTruthy()
  })

  it('renders logout button', () => {
    render(<ProfileDropdown user={mockUser} />)
    expect(screen.getByText('Выйти из аккаунта')).toBeTruthy()
  })

  it('closes profile on menu item click', () => {
    const closeProfile = vi.fn()
    vi.spyOn(require('./../stores/uiStore'), 'useUIStore').mockImplementation(() => ({
      closeProfile,
    } as any))
    render(<ProfileDropdown user={mockUser} />)
    fireEvent.click(screen.getByText('Личный кабинет'))
    expect(closeProfile).toHaveBeenCalled()
  })

  it('toggles theme when toggle button clicked', () => {
    render(<ProfileDropdown user={mockUser} />)
    fireEvent.click(screen.getByText('Тёмная тема'))
    expect(useThemeStore.getState().isDark).toBe(true)
  })
})
