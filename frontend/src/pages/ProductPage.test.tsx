import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ProductPage } from './ProductPage'
import { useCartStore } from '../stores/cartStore'
import i18n from '../i18n'

vi.mock('../components/Header', () => ({ Header: () => <div data-testid="header" /> }))
vi.mock('../components/Footer', () => ({ Footer: () => <div data-testid="footer" /> }))

function renderProduct(path = '/products/gpu-rtx-4070-super') {
  return render(
    <I18nextProvider i18n={i18n}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/products/:slug" element={<ProductPage />} />
      </Routes>
    </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  useCartStore.setState({ items: [], orders: [], favorites: [], nextOrderId: 1 })
})

describe('ProductPage TASK 003', () => {
  it('renders the selected product and no invalid additional thumbnails', () => {
    renderProduct()
    expect(screen.getByRole('heading', { name: /MSI GeForce RTX 4070 SUPER/ })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Показать изображение/ })).toHaveLength(1)
    expect(screen.getByTestId('footer')).toBeTruthy()
  })


  it('shows the dynamic Back button on the product page', () => {
    renderProduct()
    expect(screen.getByRole('button', { name: 'Назад' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'В каталог' })).toBeNull()
  })

  it('displays an unknown-product state', () => {
    renderProduct('/products/definitely-not-found')
    expect(screen.getByRole('heading', { name: 'Товар не найден' })).toBeTruthy()
  })

  it('adds selected units to an existing cart quantity', () => {
    useCartStore.getState().addItem({ id: 7, name: 'RTX', price: 64990, image: 'x', specs: [], category: 'Видеокарты' }, 5)
    renderProduct()
    const increase = screen.getByRole('button', { name: /Увеличить количество/ })
    fireEvent.click(increase)
    fireEvent.click(increase)
    fireEvent.click(screen.getByRole('button', { name: 'Добавить в корзину' }))
    expect(useCartStore.getState().items[0].quantity).toBe(8)
  })

  it('creates a purchase snapshot without touching an unrelated cart item', () => {
    useCartStore.getState().addItem({ id: 14, name: 'Ryzen', price: 34990, image: 'x', specs: [], category: 'Процессоры' }, 2)
    renderProduct()
    fireEvent.click(screen.getByRole('button', { name: /Увеличить количество/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Купить сейчас' }))
    expect(useCartStore.getState().orders[0].items).toHaveLength(1)
    expect(useCartStore.getState().orders[0].items[0]).toMatchObject({ id: 7, quantity: 2 })
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useCartStore.getState().items[0].id).toBe(14)
    fireEvent.click(screen.getByRole('button', { name: /Увеличить количество/ }))
    expect(screen.getByText(/Демо-заказ №1:.*× 2/)).toBeTruthy()
  })

  it('recalculates rating and count after submitting a locally saved review', () => {
    const { unmount } = renderProduct()
    fireEvent.click(screen.getByRole('button', { name: 'Оставить отзыв' }))
    fireEvent.change(screen.getByPlaceholderText('Как вас зовут'), { target: { value: 'Покупатель' } })
    fireEvent.click(screen.getByRole('button', { name: 'Оставить 1 звёзд' }))
    fireEvent.change(screen.getByPlaceholderText('Поделитесь впечатлениями'), { target: { value: 'Проверка отзывов' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(screen.getAllByText('4 отзыва').length).toBeGreaterThan(0)
    expect(screen.getByText('Проверка отзывов')).toBeTruthy()
    expect(screen.getByText('3.5')).toBeTruthy() // (5 + 4 + 4 + 1) / 4
    unmount()
    renderProduct()
    expect(screen.getByText('Проверка отзывов')).toBeTruthy()
  })
})
