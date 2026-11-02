import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { BackButton } from './BackButton'

afterEach(() => cleanup())

describe('BackButton', () => {
  it('returns to the actual previous entry rather than a fixed catalog path', () => {
    render(
      <MemoryRouter initialEntries={['/catalog?q=rtx&page=3', '/products/gpu-rtx-4070-super']} initialIndex={1}>
        <Routes>
          <Route path="/catalog" element={<p>Предыдущая страница с сохранённым поиском</p>} />
          <Route path="/products/:slug" element={<BackButton />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByText('Предыдущая страница с сохранённым поиском')).toBeTruthy()
  })

  it('does not substitute a hard-coded page when there is no previous entry', () => {
    render(
      <MemoryRouter initialEntries={['/products/gpu-rtx-4070-super']}>
        <Routes>
          <Route path="/products/:slug" element={<BackButton />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByRole('button', { name: 'Назад' })).toBeTruthy()
  })
})
