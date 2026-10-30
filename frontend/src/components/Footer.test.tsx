import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Footer } from './Footer'

vi.mock('react-icons/fi', () => ({
  FiShoppingCart: () => <div data-testid="fi-cart" />,
  FiPhone: () => <div data-testid="fi-phone" />,
  FiFileText: () => <div data-testid="fi-file" />,
}))

vi.mock('react-icons/hi2', () => ({
  HiMiniCube: () => <div data-testid="hi-cube" />,
  HiMiniChevronRight: () => <div data-testid="hi-chevron" />,
}))

vi.mock('react-icons/si', () => ({
  SiTelegram: () => <div data-testid="si-telegram" />,
  SiVk: () => <div data-testid="si-vk" />,
  SiYoutube: () => <div data-testid="si-youtube" />,
  SiGmail: () => <div data-testid="si-gmail" />,
}))

describe('Footer component', () => {
  beforeEach(() => cleanup())

  it('renders footer element', () => {
    render(<Footer />)
    expect(document.querySelector('footer')).toBeTruthy()
  })

  it('renders all 4 column headings', () => {
    render(<Footer />)
    expect(screen.getByText('Магазин')).toBeTruthy()
    expect(screen.getByText('Покупателям')).toBeTruthy()
    expect(screen.getByText('Контакты')).toBeTruthy()
    expect(screen.getByText('Документы')).toBeTruthy()
  })

  it('renders Shop links', () => {
    render(<Footer />)
    expect(screen.getByText('Каталог товаров')).toBeTruthy()
    expect(screen.getByText('Готовые сборки')).toBeTruthy()
    expect(screen.getByText('Конфигуратор ПК')).toBeTruthy()
    expect(screen.getByText('О нас')).toBeTruthy()
  })

  it('renders Buyer links', () => {
    render(<Footer />)
    expect(screen.getByText('Доставка и оплата')).toBeTruthy()
    expect(screen.getByText('Гарантия и возврат')).toBeTruthy()
    expect(screen.getByText('Частые вопросы (FAQ)')).toBeTruthy()
  })

  it('renders Contact links', () => {
    render(<Footer />)
    expect(screen.getByText('Электронная почта')).toBeTruthy()
    expect(screen.getByText('Телефон')).toBeTruthy()
    expect(screen.getByText('Telegram')).toBeTruthy()
    expect(screen.getByText('Форма обратной связи')).toBeTruthy()
  })

  it('renders Document links', () => {
    render(<Footer />)
    expect(screen.getByText(/Политика конфиденциальности/i)).toBeTruthy()
    expect(screen.getByText(/Пользовательское соглашение/i)).toBeTruthy()
    expect(screen.getByText(/Публичная оферта/i)).toBeTruthy()
    expect(screen.getByText(/Обработка персональных данных/i)).toBeTruthy()
  })

  it('renders copyright notice', () => {
    render(<Footer />)
    const copyright = screen.getAllByText(/2026 PC Builder/i)
    expect(copyright.length).toBeGreaterThan(0)
  })

  it('renders tagline', () => {
    render(<Footer />)
    const taglines = screen.getAllByText(/Комплектующие.*Сборки.*Конфигуратор/i)
    expect(taglines.length).toBeGreaterThan(0)
  })

  it('renders social icons', () => {
    render(<Footer />)
    expect(screen.getByLabelText('Telegram')).toBeTruthy()
    expect(screen.getByLabelText('VK')).toBeTruthy()
    expect(screen.getByLabelText('YouTube')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('renders logo', () => {
    render(<Footer />)
    const logos = screen.getAllByAltText('PC Builder')
    expect(logos.length).toBeGreaterThan(0)
  })
})
