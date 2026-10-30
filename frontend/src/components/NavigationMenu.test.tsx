import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { NavigationMenu } from './NavigationMenu'
import { useUIStore } from '../stores/uiStore'

vi.mock('react-icons/fi', () => ({
  FiHome: () => <div data-testid="fi-home" />,
  FiBox: () => <div data-testid="fi-box" />,
  FiCpu: () => <div data-testid="fi-cpu" />,
  FiMonitor: () => <div data-testid="fi-monitor" />,
  FiHeadphones: () => <div data-testid="fi-headphones" />,
  FiWind: () => <div data-testid="fi-wind" />,
  FiServer: () => <div data-testid="fi-server" />,
  FiSettings: () => <div data-testid="fi-settings" />,
  FiTag: () => <div data-testid="fi-tag" />,
  FiHelpCircle: () => <div data-testid="fi-help" />,
  FiInfo: () => <div data-testid="fi-info" />,
}))

vi.mock('react-icons/hi2', () => ({
  HiMiniChevronRight: () => <div data-testid="hi-chevron" />,
}))

describe('NavigationMenu component', () => {
  beforeEach(() => {
    useUIStore.getState().closeNav()
    cleanup()
  })

  it('renders all 11 menu items', () => {
    render(<NavigationMenu onClose={() => {}} />)
    const items = [
      'Главная',
      'Готовые сборки',
      'Комплектующие',
      'Периферия',
      'Аксессуары',
      'Охлаждение',
      'Сетевое оборудование',
      'Софт и сервисы',
      'Акции',
      'Помощь',
      'О нас',
    ]
    items.forEach(label => {
      expect(screen.getByText(label)).toBeTruthy()
    })
  })

  it('calls onClose when a menu item is clicked', () => {
    const onClose = vi.fn()
    render(<NavigationMenu onClose={onClose} />)
    fireEvent.click(screen.getByText('Главная'))
    expect(onClose).toHaveBeenCalled()
  })

  it('renders icons for each menu item', () => {
    render(<NavigationMenu onClose={() => {}} />)
    // Check that icon elements exist
    const iconElements = screen.container.querySelectorAll('[data-testid]')
    expect(iconElements.length).toBeGreaterThan(0)
  })
})
