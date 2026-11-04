import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BuilderComponentRow } from './BuilderComponentRow'
import { useBuilderStore, emptyBuilderSelections, getProductsForCategory } from '../stores/builderStore'

beforeEach(() => useBuilderStore.setState({ selections: emptyBuilderSelections() }))
afterEach(() => cleanup())

describe('BuilderComponentRow', () => {
  it('opens selector from an empty slot and lets the user select and remove a product', () => {
    render(<BuilderComponentRow category="cpu" />)
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать Процессор' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    const choose = screen.getByText('AMD Ryzen 7 7800X3D').closest('button')
    expect(choose).not.toBeNull()
    fireEvent.click(choose!)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useBuilderStore.getState().selections.cpu?.name).toBe('AMD Ryzen 7 7800X3D')
    fireEvent.click(screen.getByRole('button', { name: 'Удалить Процессор' }))
    expect(useBuilderStore.getState().selections.cpu).toBeNull()
  })

  it('shows a red inline error below a component when selected parts conflict', () => {
    const cpu = getProductsForCategory('cpu').find((p) => p.name.includes('7800X3D'))!
    const incompatibleMobo = getProductsForCategory('mobo').find((p) => p.name.includes('Z790 AORUS'))!
    const selections = emptyBuilderSelections()
    selections.cpu = cpu
    selections.mobo = incompatibleMobo
    useBuilderStore.setState({ selections })
    render(<BuilderComponentRow category="cpu" />)
    const error = screen.getByRole('alert')
    expect(error.textContent).toContain('Сокет CPU и платы')
    expect(error.className).toContain('text-red-500')
  })

  it('closes an empty-slot selector without losing state', () => {
    render(<BuilderComponentRow category="cpu" />)
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать Процессор' }))
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useBuilderStore.getState().selections.cpu).toBeNull()
  })
})
