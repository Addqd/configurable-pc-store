import { getProductsForCategory } from '../test-api'
import { render } from '../test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { mockCatalogFetch } from '../test-api'
import { BuilderComponentRow } from './BuilderComponentRow'
import { useBuilderStore, emptyBuilderSelections } from '../stores/builderStore'

beforeEach(() => { useBuilderStore.setState({ selections: emptyBuilderSelections() }); mockCatalogFetch() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('BuilderComponentRow', () => {
  it('loads products from the server and selects and removes a product', async () => {
    render(<BuilderComponentRow category="cpu" />)
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать Процессор' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    const choose = (await screen.findByText('AMD Ryzen 7 7800X3D')).closest('button')
    expect(choose).not.toBeNull()
    fireEvent.click(choose!)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useBuilderStore.getState().selections.cpu?.name).toBe('AMD Ryzen 7 7800X3D')
    fireEvent.click(screen.getByRole('button', { name: 'Удалить Процессор' }))
    expect(useBuilderStore.getState().selections.cpu).toBeNull()
  })

  it('does not claim compatibility based on local product text', () => {
    const cpu = getProductsForCategory('cpu').find((p) => p.name.includes('7800X3D'))!
    const incompatibleMobo = getProductsForCategory('mobo').find((p) => p.name.includes('Z790 AORUS'))!
    const selections = emptyBuilderSelections()
    selections.cpu = cpu
    selections.mobo = incompatibleMobo
    useBuilderStore.setState({ selections })
    render(<BuilderComponentRow category="cpu" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('closes an empty-slot selector without losing state', () => {
    render(<BuilderComponentRow category="cpu" />)
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать Процессор' }))
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useBuilderStore.getState().selections.cpu).toBeNull()
  })
})
