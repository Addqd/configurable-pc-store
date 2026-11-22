import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AdminLayout } from './AdminLayout'

vi.mock('../Header', () => ({ Header: () => <header data-testid="storefront-header" /> }))
afterEach(() => cleanup())

function renderAdmin(path = '/admin/products') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>Витрина магазина</p>} />
        <Route path="/admin/products" element={<AdminLayout><p>Список товаров</p></AdminLayout>} />
        <Route path="/admin/events" element={<AdminLayout footer={false}><p>Журнал событий</p></AdminLayout>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('admin return control', () => {
  it('links to the storefront while the shared header, content and footer stay in place', () => {
    renderAdmin()
    const link = screen.getByRole('link', { name: 'В магазин' })
    expect(link.getAttribute('href')).toBe('/')
    expect(screen.getByTestId('storefront-header')).toBeTruthy()
    expect(screen.getByText('Список товаров')).toBeTruthy()
    expect(screen.getByText('© PC Builder Панель администратора')).toBeTruthy()
  })

  it('is reachable with the keyboard', () => {
    renderAdmin()
    const link = screen.getByRole('link', { name: 'В магазин' })
    link.focus()
    expect(document.activeElement).toBe(link)
  })

  it('navigates to the storefront through the router instead of reloading the document', () => {
    renderAdmin()
    fireEvent.click(screen.getByRole('link', { name: 'В магазин' }))
    expect(screen.getByText('Витрина магазина')).toBeTruthy()
    expect(screen.queryByText('Список товаров')).toBeNull()
  })

  it('stays available on a layout that renders its own footer', () => {
    renderAdmin('/admin/events')
    expect(screen.getByRole('link', { name: 'В магазин' })).toBeTruthy()
    expect(screen.queryByText('© PC Builder Панель администратора')).toBeNull()
  })
})
