import { describe, it, expect, beforeEach } from 'vitest'
import { useCartStore } from './cartStore'

describe('Cart store', () => {
  beforeEach(() => {
    useCartStore.getState().clear()
    useCartStore.setState({ orders: [], nextOrderId: 1000 })
  })

  it('starts empty', () => {
    expect(useCartStore.getState().items).toEqual([])
    expect(useCartStore.getState().totalItems()).toBe(0)
    expect(useCartStore.getState().totalPrice()).toBe(0)
  })

  it('adds regular item', () => {
    useCartStore.getState().addItem({
      id: 1,
      name: 'Test Product',
      price: 1000,
      image: 'test.jpg',
      specs: ['spec1'],
      category: 'test',
    })
    expect(useCartStore.getState().totalItems()).toBe(1)
    expect(useCartStore.getState().totalPrice()).toBe(1000)
  })

  it('increments quantity for duplicate regular item', () => {
    useCartStore.getState().addItem({
      id: 1,
      name: 'Test Product',
      price: 1000,
      image: 'test.jpg',
      specs: ['spec1'],
      category: 'test',
    })
    useCartStore.getState().addItem({
      id: 1,
      name: 'Test Product',
      price: 1000,
      image: 'test.jpg',
      specs: ['spec1'],
      category: 'test',
    })
    expect(useCartStore.getState().totalItems()).toBe(2)
    expect(useCartStore.getState().totalPrice()).toBe(2000)
  })

  it('removes item', () => {
    useCartStore.getState().addItem({
      id: 1,
      name: 'Test Product',
      price: 1000,
      image: 'test.jpg',
      specs: ['spec1'],
      category: 'test',
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
      specs: ['spec1'],
      category: 'test',
    })
    useCartStore.getState().addItem({
      id: 2,
      name: 'Another Product',
      price: 2000,
      image: 'test.jpg',
      specs: ['spec2'],
      category: 'test',
    })
    useCartStore.getState().clear()
    expect(useCartStore.getState().items).toEqual([])
    expect(useCartStore.getState().totalItems()).toBe(0)
  })

  it('updates quantity', () => {
    useCartStore.getState().addItem({
      id: 1,
      name: 'Test Product',
      price: 1000,
      image: 'test.jpg',
      specs: ['spec1'],
      category: 'test',
    })
    useCartStore.getState().updateQuantity(1, 5)
    expect(useCartStore.getState().totalItems()).toBe(5)
    expect(useCartStore.getState().totalPrice()).toBe(5000)
  })

  it('min quantity is 1', () => {
    useCartStore.getState().addItem({
      id: 1,
      name: 'Test Product',
      price: 1000,
      image: 'test.jpg',
      specs: ['spec1'],
      category: 'test',
    })
    useCartStore.getState().updateQuantity(1, 0)
    expect(useCartStore.getState().totalItems()).toBe(1)
  })

  it('adds build', () => {
    useCartStore.getState().addBuild({
      id: 10,
      name: 'Игровая сборка',
      price: 50000,
      image: 'build.jpg',
      description: 'Балансированная сборка',
      category: 'Готовые сборки',
      specs: '',
      components: [
        { category: 'Видеокарта', name: 'RTX 4070', specs: '12 ГБ', quantity: 1 },
      ],
    })
    expect(useCartStore.getState().totalItems()).toBe(1)
    expect(useCartStore.getState().totalPrice()).toBe(50000)
  })

  it('build is a single cart item', () => {
    useCartStore.getState().addBuild({
      id: 10,
      name: 'Игровая сборка',
      price: 50000,
      image: 'build.jpg',
      description: 'Балансированная сборка',
      category: 'Готовые сборки',
      specs: '',
      components: [
        { category: 'Видеокарта', name: 'RTX 4070', specs: '12 ГБ', quantity: 1 },
        { category: 'Процессор', name: 'Ryzen 7', specs: '8 ядер', quantity: 1 },
      ],
    })
    expect(useCartStore.getState().totalItems()).toBe(1)
    expect(useCartStore.getState().totalPrice()).toBe(50000)
  })

  it('toggles build expand', () => {
    useCartStore.getState().addBuild({
      id: 10,
      name: 'Игровая сборка',
      price: 50000,
      image: 'build.jpg',
      description: 'Балансированная сборка',
      category: 'Готовые сборки',
      specs: '',
      components: [],
    })
    const item = useCartStore.getState().items[0]
    expect('isExpanded' in (item || {}) && (item as { isExpanded: boolean }).isExpanded).toBe(true)
    useCartStore.getState().toggleBuildExpand(10)
    const item2 = useCartStore.getState().items[0]
    expect('isExpanded' in (item2 || {}) && (item2 as { isExpanded: boolean }).isExpanded).toBe(false)
    useCartStore.getState().toggleBuildExpand(10)
    const item3 = useCartStore.getState().items[0]
    expect('isExpanded' in (item3 || {}) && (item3 as { isExpanded: boolean }).isExpanded).toBe(true)
  })

  it('places order', () => {
    useCartStore.getState().addItem({
      id: 1,
      name: 'Test Product',
      price: 1000,
      image: 'test.jpg',
      specs: ['spec1'],
      category: 'test',
    })
    const order = useCartStore.getState().placeOrder()
    expect(order.items).toHaveLength(1)
    expect(order.items[0].total).toBe(1000)
    expect(useCartStore.getState().items).toEqual([])
    expect(useCartStore.getState().orders).toHaveLength(1)
  })

  it('placeOrder preserves order data', () => {
    useCartStore.getState().addItem({
      id: 1,
      name: 'Test Product',
      price: 1000,
      image: 'test.jpg',
      specs: ['spec1'],
      category: 'test',
    })
    useCartStore.getState().addItem({
      id: 2,
      name: 'Another',
      price: 2000,
      image: 'test.jpg',
      specs: ['spec2'],
      category: 'test',
    })
    const order = useCartStore.getState().placeOrder()
    expect(order.items).toHaveLength(2)
    expect(order.items.every((o: typeof order.items[0]) => 'timestamp' in o && typeof o.timestamp === 'number')).toBe(true)
  })
})
