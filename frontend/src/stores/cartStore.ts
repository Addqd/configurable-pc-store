import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import placeholder from '../assets/placeholder.jpg'

export interface BuildComponent {
  category: string
  name: string
  specs: string
  quantity: number
  image?: string
}

export interface BuildCartItem {
  category?: string
  specs?: string
  id: number
  name: string
  price: number
  quantity: number
  image: string
  description: string
  components: BuildComponent[]
  isExpanded: boolean
}

export interface RegularCartItem {
  id: number
  name: string
  price: number
  quantity: number
  image: string
  specs: string[]
  category: string
}

export type CartItem = RegularCartItem | BuildCartItem

export interface OrderItem {
  id: number
  name: string
  price: number
  quantity: number
  total: number
  image?: string
  components?: BuildComponent[]
  timestamp: number
}

export interface Order {
  id: number
  items: OrderItem[]
  total: number
  itemCount: number
  timestamp: number
  ownerId?: string
}

interface CartState {
  items: CartItem[]
  orders: Order[]
  favorites: number[]
  nextOrderId: number
  activeAccountId: string | null
  addItem: (item: Omit<RegularCartItem, 'quantity'>, quantity?: number) => void
  toggleFavorite: (id: number) => void
  purchaseProduct: (item: Omit<RegularCartItem, 'quantity'>, quantity: number) => Order | null
  addBuild: (build: Omit<BuildCartItem, 'quantity' | 'isExpanded'>) => void
  removeItem: (id: number) => void
  updateQuantity: (id: number, quantity: number) => void
  toggleBuildExpand: (id: number) => void
  clear: () => void
  totalItems: () => number
  totalPrice: () => number
  placeOrder: () => Order
  setActiveAccountId: (id: string | null) => void
  removeOrdersForAccount: (id: string) => void
}

export const useCartStore = create<CartState>()(persist(
  (set, get) => ({
    items: [],
    orders: [],
    favorites: [],
    nextOrderId: 1,
    // Session belongs to accountStore; never persist a second, potentially stale copy.
    activeAccountId: null,

    setActiveAccountId: (id) => set({ activeAccountId: id }),
    removeOrdersForAccount: (id) => set((s) => ({ orders: s.orders.filter((o) => o.ownerId !== id) })),

    addItem: (item, quantity = 1) => {
      if (!Number.isFinite(item.price) || item.price < 0 || !Number.isSafeInteger(quantity) || quantity < 1) return
      set((s) => {
        const exists = s.items.some((i) => i.id === item.id && !('components' in i))
        return {
          items: exists
            ? s.items.map((i) => i.id === item.id && !('components' in i) ? { ...i, quantity: i.quantity + quantity } : i)
            : [...s.items, { ...item, quantity }],
        }
      })
    },
    toggleFavorite: (id) => set((s) => ({
      favorites: s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [...s.favorites, id],
    })),
    // Buying a product directly must not mutate the current shopping cart.
    purchaseProduct: (item, quantity) => {
      if (!Number.isFinite(item.price) || item.price < 0 || !Number.isSafeInteger(quantity) || quantity < 1) return null
      const s = get()
      const timestamp = Date.now()
      const order: Order = {
        id: s.nextOrderId,
        items: [{ id: item.id, name: item.name, price: item.price, quantity,
          total: item.price * quantity, image: item.image, timestamp }],
        itemCount: quantity,
        total: item.price * quantity,
        timestamp,
        ...(s.activeAccountId ? { ownerId: s.activeAccountId } : {}),
      }
      set({ orders: [...s.orders, order], nextOrderId: s.nextOrderId + 1 })
      return order
    },
    addBuild: (build) => {
      if (!Number.isFinite(build.price) || build.price < 0) return
      const exists = get().items.some((i) => i.id === build.id && 'components' in i)
      if (exists) {
        set((s) => ({ items: s.items.map((i) => i.id === build.id && 'components' in i
          ? { ...i, quantity: i.quantity + 1 } : i) }))
      } else {
        set((s) => ({ items: [...s.items, {
          ...build, quantity: 1, isExpanded: true, category: 'Готовые сборки',
          components: build.components.map((c) => ({ ...c })),
        }] }))
      }
    },
    removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
    updateQuantity: (id, quantity) => {
      if (!Number.isSafeInteger(quantity)) return
      set((s) => ({ items: s.items.map((i) => i.id === id ? { ...i, quantity: Math.max(1, quantity) } : i) }))
    },
    toggleBuildExpand: (id) => set((s) => ({ items: s.items.map((i) => i.id === id && 'isExpanded' in i
      ? { ...i, isExpanded: !i.isExpanded } : i) })),
    clear: () => set({ items: [] }),
    totalItems: () => get().items.reduce((total, item) => total + item.quantity, 0),
    totalPrice: () => get().items.reduce((total, item) => total + item.price * item.quantity, 0),
    placeOrder: () => {
      const s = get()
      if (s.items.length === 0) throw new Error('Нельзя оформить пустой заказ')
      const timestamp = Date.now()
      const orderItems: OrderItem[] = s.items.map((item) => {
        const snapshot: OrderItem = {
          id: item.id, name: item.name, price: item.price, quantity: item.quantity,
          total: item.price * item.quantity, image: item.image, timestamp,
        }
        if ('components' in item) snapshot.components = item.components.map((c) => ({ ...c }))
        return snapshot
      })
      const order: Order = {
        id: s.nextOrderId, items: orderItems,
        total: s.items.reduce((total, item) => total + item.price * item.quantity, 0),
        itemCount: s.items.reduce((total, item) => total + item.quantity, 0),
        timestamp,
        ...(s.activeAccountId ? { ownerId: s.activeAccountId } : {}),
      }
      set({ orders: [...s.orders, order], nextOrderId: s.nextOrderId + 1, items: [] })
      return order
    },
  }),
  {
    name: 'pc-builder-cart', version: 1,
    partialize: (s) => ({ items: s.items, orders: s.orders, favorites: s.favorites, nextOrderId: s.nextOrderId }),
    merge: (saved, current) => {
      const s = saved && typeof saved === 'object' ? saved as Partial<CartState> : {}
      const orders = Array.isArray(s.orders) ? s.orders : []
      const maxId = orders.reduce((n, o) => Math.max(n, Number.isSafeInteger(o?.id) ? o.id : 0), 0)
      return {
        ...current,
        items: Array.isArray(s.items) ? s.items : [],
        orders,
        favorites: Array.isArray(s.favorites) ? s.favorites : [],
        nextOrderId: Math.max(maxId + 1, Number.isSafeInteger(s.nextOrderId) ? s.nextOrderId! : 1),
        activeAccountId: null,
      }
    },
  },
))

export function seedDemoCart() {
  const state = useCartStore.getState()
  state.addItem({ id: 7, name: 'MSI GeForce RTX 4070 SUPER Gaming X Slim 12G', price: 64990,
    image: placeholder, specs: ['12 ГБ GDDR6X', '192 бит', '2475 МГц', 'DLSS 3'], category: 'Видеокарты' })
  state.addItem({ id: 14, name: 'AMD Ryzen 7 7800X3D', price: 34990,
    image: placeholder, specs: ['8 ядер', '16 потоков', '4.2 – 5.0 ГГц', 'AM5'], category: 'Процессоры' })
  state.addBuild({
    id: 100, name: 'Игровая сборка', price: 134990, image: placeholder,
    description: 'Сбалансированная сборка для комфортной игры в современных проектах',
    category: 'Готовые сборки', specs: '',
    components: [
      { category: 'Видеокарта', name: 'MSI GeForce RTX 4070 SUPER Gaming X Slim 12G', specs: '12 ГБ GDDR6X', quantity: 1 },
      { category: 'Процессор', name: 'AMD Ryzen 7 7800X3D', specs: '8 ядер, 16 потоков', quantity: 1 },
      { category: 'Материнская плата', name: 'ASUS TUF Gaming B650-PLUS', specs: 'AM5, B650, ATX', quantity: 1 },
      { category: 'Оперативная память', name: 'Kingston Fury Beast 32 ГБ (2×16) DDR5-6000', specs: '32 ГБ, DDR5', quantity: 1 },
      { category: 'Накопитель', name: 'Samsung 990 PRO 1 ТБ', specs: 'M.2 NVMe, PCIe 4.0', quantity: 1 },
      { category: 'Блок питания', name: 'Corsair RM750e 750 Вт', specs: '80+ Gold, модульный', quantity: 1 },
      { category: 'Корпус', name: 'Lian Li Lancool 216', specs: 'ATX, отличное охлаждение', quantity: 1 },
    ],
  })
}
