import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { NavigationMenu } from './NavigationMenu'
import i18n from '../i18n'

vi.mock('react-icons/fi', () => ({
  FiHome: () => <div data-testid="fi-home" />,
  FiTool: () => <div data-testid="fi-tool" />,
  FiBox: () => <div data-testid="fi-box" />,
  FiCpu: () => <div data-testid="fi-cpu" />,
  FiMonitor: () => <div data-testid="fi-monitor" />,
  FiHeadphones: () => <div data-testid="fi-headphones" />,
  FiWind: () => <div data-testid="fi-wind" />,
  FiServer: () => <div data-testid="fi-server" />,
  FiSettings: () => <div data-testid="fi-settings" />,
}))

vi.mock('react-icons/hi2', () => ({
  HiMiniChevronRight: () => <div data-testid="hi-chevron" />,
}))

const APPROVED_LABELS = [
  'Главная',
  'Конфигуратор ПК',
  'Готовые сборки',
  'Комплектующие',
  'Периферия',
  'Аксессуары',
  'Охлаждение',
  'Сетевое оборудование',
  'Софт и сервисы',
]

const APPROVED_HREFS = [
  '/',
  '/builder',
  '/catalog?category=prebuilt',
  '/catalog?category=components',
  '/catalog?category=peripheral',
  '/catalog?category=accessories',
  '/catalog?category=cooling',
  '/catalog?category=network',
  '/catalog?category=software',
]

const renderMenu = () =>
  render(
    <MemoryRouter>
      <NavigationMenu onClose={() => {}} />
    </MemoryRouter>
  )

const menuLinks = () => screen.getAllByRole('link')
const menuHrefs = () => menuLinks().map((link) => link.getAttribute('href'))

describe('NavigationMenu component', () => {
  afterEach(async () => {
    cleanup()
    await act(async () => { await i18n.changeLanguage('ru') })
  })

  it('renders exactly the nine approved entries in order', () => {
    renderMenu()
    expect(menuLinks()).toHaveLength(APPROVED_LABELS.length)
    expect(menuLinks().map((link) => link.textContent)).toEqual(APPROVED_LABELS)
    APPROVED_LABELS.forEach(label => {
      expect(screen.getByText(label)).toBeTruthy()
    })
  })

  it('removes the sales, help and about entries', () => {
    renderMenu()
    expect(screen.queryByText('Акции')).toBeNull()
    expect(screen.queryByText('Помощь')).toBeNull()
    expect(screen.queryByText('О нас')).toBeNull()
    expect(menuHrefs()).not.toContain('/catalog?category=sale')
    expect(menuHrefs()).not.toContain('/account')
  })

  it('keeps every destination untouched', () => {
    renderMenu()
    expect(menuHrefs()).toEqual(APPROVED_HREFS)
    expect(menuLinks()[1].textContent).toContain('Конфигуратор ПК')
    expect(menuHrefs()[1]).toBe('/builder')
  })

  it('renders no separator inside the menu', () => {
    renderMenu()
    expect(document.querySelectorAll('.border-t')).toHaveLength(0)
    expect(document.querySelectorAll('.my-1')).toHaveLength(0)
    // Every entry is a direct child of the menu panel, without wrapper elements.
    const panel = document.querySelector('.w-\\[280px\\]') as HTMLElement
    expect(panel.children).toHaveLength(APPROVED_LABELS.length)
    expect([...panel.children].every((child) => child.tagName === 'A')).toBe(true)
  })

  it('keeps the approved item markup', () => {
    renderMenu()
    const [home, configurator] = menuLinks()
    expect(home.className).toBe(
      'flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-primary-light hover:text-primary rounded-lg transition-colors',
    )
    expect(configurator.querySelector('[data-testid="fi-tool"]')).not.toBeNull()
    // Same trailing chevron as every other entry.
    expect(configurator.querySelector('[data-testid="hi-chevron"]')).not.toBeNull()
  })

  it('renders an icon for every entry', () => {
    renderMenu()
    const icons = document.querySelectorAll('[data-testid^="fi-"]')
    expect(icons).toHaveLength(APPROVED_LABELS.length)
  })

  it('localizes the entries in Russian and English', async () => {
    renderMenu()
    expect(screen.getByText('Сетевое оборудование')).toBeTruthy()

    await act(async () => { await i18n.changeLanguage('en') })
    expect(screen.getByText('Networking')).toBeTruthy()
    expect(screen.getByText('PC Configurator')).toBeTruthy()
    expect(screen.queryByText('Сетевое оборудование')).toBeNull()
    expect(menuLinks()).toHaveLength(APPROVED_LABELS.length)
    expect(menuHrefs()).toEqual(APPROVED_HREFS)
  })

  it('calls onClose when a menu item is clicked', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <NavigationMenu onClose={onClose} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Главная'))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes the menu from the last entry as well', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <NavigationMenu onClose={onClose} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByText('Софт и сервисы'))
    expect(onClose).toHaveBeenCalled()
  })
})
