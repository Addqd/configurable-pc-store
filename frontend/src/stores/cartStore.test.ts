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

  it('ignores invalid prices and non-finite quantities', () => {
    const product = { id: 44, name: 'Товар', price: -100, image: 'x', specs: [], category: 'test' }
    useCartStore.getState().addItem(product)
    expect(useCartStore.getState().items).toHaveLength(0)
    useCartStore.getState().addItem({ ...product, price: 100 })
    useCartStore.getState().updateQuantity(44, Number.NaN)
    expect(useCartStore.getState().totalItems()).toBe(1)
    expect(useCartStore.getState().totalPrice()).toBe(100)
  })

  it('preserves an independent snapshot of build components in orders', () => {
    const components = [{ category: 'Видеокарта', name: 'GPU', specs: '16 ГБ', quantity: 1 }]
    useCartStore.getState().addBuild({
      id: 100,
      name: 'Сборка',
      price: 25000,
      image: 'x',
      description: 'Демо',
      components,
    })
    components[0].name = 'Изменено снаружи'
    const order = useCartStore.getState().placeOrder()
    expect(order.items[0].components?.[0].name).toBe('GPU')
    expect(order.total).toBe(25000)
    expect(useCartStore.getState().totalItems()).toBe(0)
  })

  it('does not create an empty demo order', () => {
    expect(() => useCartStore.getState().placeOrder()).toThrow()
    expect(useCartStore.getState().orders).toHaveLength(0)
  })

})

describe('Product page cart and one-click purchase regressions', () => {
  const gpu = {
    id: 7,
    name: 'RTX 4070 SUPER',
    price: 64990,
    image: 'demo.jpg',
    specs: ['12 ГБ'],
    category: 'Видеокарты',
  }

  beforeEach(() => {
    useCartStore.setState({ items: [], orders: [], favorites: [], nextOrderId: 1 })
  })

  it('adds the requested quantity to an existing cart line (5 + 3 = 8)', () => {
    useCartStore.getState().addItem(gpu, 5)
    useCartStore.getState().addItem(gpu, 3)
    expect(useCartStore.getState().items[0].quantity).toBe(8)
    expect(useCartStore.getState().totalPrice()).toBe(64990 * 8)
  })

  it('creates new lines with the requested quantity', () => {
    useCartStore.getState().addItem(gpu, 3)
    expect(useCartStore.getState().items[0].quantity).toBe(3)
  })

  it('rejects invalid requested quantities', () => {
    useCartStore.getState().addItem(gpu, -1)
    useCartStore.getState().addItem(gpu, Number.NaN)
    useCartStore.getState().addItem(gpu, 1.5)
    expect(useCartStore.getState().items).toEqual([])
  })

  it('purchases only the requested product and preserves the cart and order snapshot', () => {
    const other = { ...gpu, id: 14, name: 'Ryzen', price: 34990 }
    useCartStore.getState().addItem(other, 2)
    const beforeItems = structuredClone(useCartStore.getState().items)
    const order = useCartStore.getState().purchaseProduct(gpu, 3)!
    expect(order.items).toHaveLength(1)
    expect(order.items[0]).toMatchObject({ id: 7, quantity: 3, price: 64990, total: 3 * 64990 })
    expect(order.total).toBe(3 * 64990)
    expect(useCartStore.getState().orders).toHaveLength(1)
    expect(useCartStore.getState().items).toEqual(beforeItems)
    useCartStore.getState().addItem(gpu, 1)
    expect(useCartStore.getState().orders[0].items[0].quantity).toBe(3)
  })

  it('allocates distinct IDs for repeated purchases and preserves favorites', () => {
    const a = useCartStore.getState().purchaseProduct(gpu, 1)!
    const b = useCartStore.getState().purchaseProduct(gpu, 2)!
    expect(b.id).toBe(a.id + 1)
    useCartStore.getState().toggleFavorite(gpu.id)
    expect(useCartStore.getState().favorites).toContain(gpu.id)
    useCartStore.getState().toggleFavorite(gpu.id)
    expect(useCartStore.getState().favorites).not.toContain(gpu.id)
  })
})
