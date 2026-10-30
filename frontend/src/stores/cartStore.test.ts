import { describe, it, expect, beforeEach } from 'vitest'
import { useCartStore } from './cartStore'

describe('Cart store', () => {
  beforeEach(() => {
    useCartStore.getState().clear()
  })

  it('starts empty', () => {
    expect(useCartStore.getState().items).toEqual([])
    expect(useCartStore.getState().totalItems()).toBe(0)
    expect(useCartStore.getState().totalPrice()).toBe(0)
  })

  it('adds item', () => {
    useCartStore.getState().addItem({
      id: 1,
      name: 'Test Product',
      price: 1000,
      image: 'test.jpg',
    })
    expect(useCartStore.getState().totalItems()).toBe(1)
    expect(useCartStore.getState().totalPrice()).toBe(1000)
  })

  it('increments quantity for duplicate item', () => {
    useCartStore.getState().addItem({
      id: 1,
      name: 'Test Product',
      price: 1000,
      image: 'test.jpg',
    })
    useCartStore.getState().addItem({
      id: 1,
      name: 'Test Product',
      price: 1000,
      image: 'test.jpg',
    })
    expect(useCartStore.getState().totalItems()).toBe(2)
  })

  it('removes item', () => {
    useCartStore.getState().addItem({
      id: 1,
      name: 'Test Product',
      price: 1000,
      image: 'test.jpg',
    })
    useCartStore.getState().removeItem(1)
    expect(useCartStore.getState().totalItems()).toBe(0)
  })

  it('clears all items', () => {
    useCartStore.getState().addItem({
      id: 1,
      name: 'Test Product',
      price: 1000,
      image: 'test.jpg',
    })
    useCartStore.getState().addItem({
      id: 2,
      name: 'Another Product',
      price: 2000,
      image: 'test.jpg',
    })
    useCartStore.getState().clear()
    expect(useCartStore.getState().items).toEqual([])
    expect(useCartStore.getState().totalItems()).toBe(0)
  })
})
