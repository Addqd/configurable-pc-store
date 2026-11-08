import type { CartOut, OrderOut } from './generated/model'
import type { BuildComponent, CartItem, Order } from '../stores/cartStore'
import placeholder from '../assets/placeholder.jpg'

function components(value: unknown): BuildComponent[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    return typeof item.slot === 'string' && typeof item.product_name === 'string'
      ? [{ category: item.slot, name: item.product_name, specs: '', quantity: 1 }]
      : []
  })
}

export function cartItems(cart: CartOut): CartItem[] {
  return (cart.items ?? []).map(item => {
    if (item.kind === 'custom_build') return {
      id: item.id, name: 'Сборка ПК', price: Number(item.unit_price), quantity: item.quantity,
      image: placeholder, description: '', components: components(item.build_snapshot?.components), isExpanded: true,
    }
    const product = item.product
    return {
      id: item.id, name: typeof product?.name === 'string' ? product.name : 'Товар недоступен',
      price: Number(item.unit_price), quantity: item.quantity,
      image: typeof product?.cover_image_url === 'string' ? product.cover_image_url : placeholder,
      category: '', specs: [],
    }
  })
}

export function orderFromServer(order: OrderOut): Order {
  const timestamp = Date.parse(order.created_at)
  return {
    id: order.id, ownerId: String(order.user_id), timestamp,
    total: Number(order.total_amount), itemCount: order.item_count,
    items: (order.items ?? []).map(item => ({
      id: item.id, name: item.name_snapshot, price: Number(item.unit_price), quantity: item.quantity,
      total: item.line_total == null ? Number(item.unit_price) * item.quantity : Number(item.line_total),
      image: item.image_url_snapshot ?? undefined, timestamp,
      ...(item.kind === 'custom_build' ? { components: components(item.components_snapshot) } : {}),
    })),
  }
}
