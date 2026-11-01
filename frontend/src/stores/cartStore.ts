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
  // Legacy fields are optional for compatibility with previously persisted demo carts.
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
  components?: BuildComponent[]
  timestamp: number
}

export interface Order {
  id: number
  items: OrderItem[]
  total: number
  itemCount: number
  timestamp: number
}

interface CartState {
  items: CartItem[]
  orders: Order[]
  favorites: number[]
  nextOrderId: number
  addItem: (item: Omit<RegularCartItem, 'quantity'>) => void
  toggleFavorite: (id: number) => void
  addBuild: (build: Omit<BuildCartItem, 'quantity' | 'isExpanded'>) => void
  removeItem: (id: number) => void
  updateQuantity: (id: number, quantity: number) => void
  toggleBuildExpand: (id: number) => void
  clear: () => void
  totalItems: () => number
  totalPrice: () => number
  placeOrder: () => Order
}

export const useCartStore = create<CartState>()(persist(
  (set, get) => ({
    items: [],
    orders: [],
    favorites: [],
    nextOrderId: 1,

    addItem: (item) => {
      if (!Number.isFinite(item.price) || item.price < 0) return
      const existing = get().items.find((i) => i.id === item.id && !('components' in i))
      if (existing) {
        set({
          items: get().items.map((i) =>
            i.id === item.id && !('components' in i)
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        })
      } else {
        const newItem = { ...item, quantity: 1 }
        set({ items: [...get().items, newItem] })
      }
    },

    toggleFavorite: (id) =>
      set((s) => ({
        favorites: s.favorites.includes(id)
          ? s.favorites.filter((fid) => fid !== id)
          : [...s.favorites, id],
      })),

    addBuild: (build) => {
      if (!Number.isFinite(build.price) || build.price < 0) return
      const existing = get().items.find((i) => i.id === build.id && 'components' in i)
      if (existing) {
        set({
          items: get().items.map((i) =>
            i.id === build.id && 'components' in i
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        })
      } else {
        set({
          items: [
            ...get().items,
            {
              ...build,
              quantity: 1,
              isExpanded: true,
              category: 'Готовые сборки',
              components: build.components.map((component) => ({ ...component })),
            },
          ],
        })
      }
    },

    removeItem: (id) =>
      set({ items: get().items.filter((i) => i.id !== id) }),

    updateQuantity: (id, quantity) => {
      if (!Number.isSafeInteger(quantity)) return
      set({
        items: get().items.map((i) =>
          i.id === id ? { ...i, quantity: Math.max(1, quantity) } : i
        ),
      })
    },

    toggleBuildExpand: (id) =>
      set({
        items: get().items.map((i) =>
          i.id === id && 'isExpanded' in i
            ? { ...i, isExpanded: !i.isExpanded }
            : i
        ),
      }),

    clear: () => set({ items: [] }),

    totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

    totalPrice: () =>
      get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),

    placeOrder: () => {
      const items = get().items
      if (items.length === 0) throw new Error('Нельзя оформить пустой заказ')
      const timestamp = Date.now()
      const total = get().totalPrice()
      const itemCount = get().totalItems()
      const orderItems: OrderItem[] = items.map((i) => {
        const lineTotal = i.price * i.quantity
        const orderItem: OrderItem = {
          id: i.id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          total: lineTotal,
          timestamp,
        }
        if ('components' in i && i.components) {
          orderItem.components = i.components.map((component) => ({ ...component }))
        }
        return orderItem
      })
      const orderId = get().nextOrderId
      const order: Order = { id: orderId, items: orderItems, total, itemCount, timestamp }
      set({
        orders: [...get().orders, order],
        nextOrderId: orderId + 1,
        items: [],
      })
      return order
    },
  }),
  {
    name: 'pc-builder-cart',
    version: 1,
  }
))

export function seedDemoCart() {
  const state = useCartStore.getState()
  state.addItem({
    id: 7,
    name: 'Видеокарта MSI GeForce RTX 4070 SUPER Gaming X Slim 12G',
    price: 64990,
    image: placeholder,
    specs: ['12 ГБ GDDR6X', '192 бит', '2475 МГц', 'DLSS 3'],
    category: 'Видеокарты',
  })
  state.addItem({
    id: 14,
    name: 'Процессор AMD Ryzen 7 7800X3D',
    price: 36990,
    image: placeholder,
    specs: ['8 ядер', '16 потоков', '4.2 – 5.0 ГГц', 'AM5'],
    category: 'Процессоры',
  })
  state.addBuild({
    id: 100,
    name: 'Игровая сборка',
    price: 134990,
    image: placeholder,
    description: 'Сбалансированная сборка для комфортной игры в современных проектах',
    category: 'Готовые сборки',
    specs: '',
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
