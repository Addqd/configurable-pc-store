import { vi } from 'vitest'

export const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
export const noContent = () => new Response(null, { status: 204 })

export const cartFixture = { items: [], item_count: 0, subtotal: '0.00', total: '0.00' }

export const ownerFixture = {
  id: 1, email: 'owner@example.test', username: 'owner', display_name: 'Александр',
  avatar_url: null, role: 'owner', status: 'active', blocked_at: null, blocked_reason: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
}

export const userFixture = {
  id: 104, email: 'ivan@example.test', username: 'ivan', display_name: 'Иван',
  avatar_url: null, role: 'user', status: 'active', blocked_at: null, blocked_reason: null,
  created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-02T00:00:00Z',
}

export const adminUserFixture = {
  id: 12, email: 'maria@example.test', username: 'maria', display_name: 'Мария',
  avatar_url: null, role: 'admin', status: 'active', blocked_at: null, blocked_reason: null,
  created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-02T00:00:00Z',
}

export const blockedUserFixture = {
  id: 87, email: 'dmitry@example.test', username: 'dmitry', display_name: 'Дмитрий',
  avatar_url: null, role: 'user', status: 'blocked', blocked_at: '2026-04-01T00:00:00Z',
  blocked_reason: 'Нарушение правил', created_at: '2026-03-05T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
}

export const productOptionsFixture = {
  categories: [
    {
      category: { id: 8, slug: 'gpu', name: 'Видеокарты', sort_order: 0 },
      product_types: [{ id: 8, category_id: 8, slug: 'discrete', name: 'Дискретная' }],
    },
    {
      category: { id: 9, slug: 'cpu', name: 'Процессоры', sort_order: 1 },
      product_types: [{ id: 10, category_id: 9, slug: 'desktop', name: 'Desktop' }],
    },
  ],
  manufacturers: [
    { id: 1, slug: 'msi', name: 'MSI' },
    { id: 4, slug: 'amd', name: 'AMD' },
  ],
}

export const characteristicDefinitionsFixture = {
  category_id: 8,
  category_name: 'Видеокарты',
  fields: [
    {
      code: 'memory_size', name: 'Объём памяти', data_type: 'string', unit: null,
      sort_order: 0, is_required: true, show_in_short: true, show_in_details: true,
    },
    {
      code: 'memory_bus', name: 'Шина памяти', data_type: 'number', unit: 'бит',
      sort_order: 1, is_required: true, show_in_short: false, show_in_details: true,
    },
    {
      code: 'has_rgb', name: 'Подсветка', data_type: 'boolean', unit: null,
      sort_order: 2, is_required: false, show_in_short: false, show_in_details: true,
    },
    {
      code: 'power_connectors', name: 'Разъёмы питания', data_type: 'string_list', unit: null,
      sort_order: 3, is_required: false, show_in_short: false, show_in_details: true,
    },
  ],
}

export const productSummaryFixture = {
  id: 7, slug: 'gpu-rtx-4070-super', sku: 'GPU-MSI-4070S',
  name: 'MSI GeForce RTX 4070 SUPER Gaming X Slim 12G', price: '64990.00',
  stock_quantity: 8, is_active: true, on_sale: false,
  category: { id: 8, slug: 'gpu', name: 'Видеокарты', sort_order: 0 },
  product_type: { id: 8, category_id: 8, slug: 'discrete', name: 'Дискретная' },
  manufacturer: { id: 1, slug: 'msi', name: 'MSI' },
  cover_image_url: '/placeholder.png', image_count: 3, listed_at: '2026-08-27',
  created_at: '2026-08-27T10:00:00Z', updated_at: '2026-11-17T14:30:00Z',
}

export const productDetailFixture = {
  id: 7, slug: 'gpu-rtx-4070-super', sku: 'GPU-MSI-4070S',
  name: 'MSI GeForce RTX 4070 SUPER Gaming X Slim 12G',
  description: 'Существующее описание товара', price: '64990.00', stock_quantity: 8,
  color: 'Чёрный', graphics_chip_brand: 'NVIDIA',
  characteristics: [
    { code: 'memory_size', name: 'Объём памяти', data_type: 'string', unit: null, sort_order: 0, is_required: true, show_in_short: true, show_in_details: true, value: '12 ГБ', display_value: '12 ГБ' },
    { code: 'memory_bus', name: 'Шина памяти', data_type: 'number', unit: 'бит', sort_order: 1, is_required: true, show_in_short: false, show_in_details: true, value: 192, display_value: '192 бит' },
  ],
  on_sale: false, is_active: true, listed_at: '2026-08-27',
  created_at: '2026-08-27T10:00:00Z', updated_at: '2026-11-17T14:30:00Z',
  category: { id: 8, slug: 'gpu', name: 'Видеокарты', sort_order: 0 },
  product_type: { id: 8, category_id: 8, slug: 'discrete', name: 'Дискретная' },
  manufacturer: { id: 1, slug: 'msi', name: 'MSI' },
  images: [
    { id: 71, url: '/photo-1.png', alt_text: null, sort_order: 0, is_cover: true },
    { id: 72, url: '/photo-2.png', alt_text: null, sort_order: 1, is_cover: false },
  ],
  cover_image_url: '/photo-1.png', average_rating: 4.8, review_count: 86,
}

export const reviewFixture = {
  id: 1, product_id: 7, product_slug: 'gpu-rtx-4070-super',
  product_name: 'MSI GeForce RTX 4070 SUPER Gaming X Slim 12G',
  user_id: 101, source: 'user', author_name: null, reviewer_name: 'Клиент 1', rating: 5,
  body: 'Отличный товар! Всё работает как ожидалось.', is_published: true,
  store_reply: 'Спасибо за отзыв!', displayed_at: '2026-11-17T14:30:00Z',
  created_at: '2026-11-17T14:30:00Z', updated_at: '2026-11-17T14:30:00Z',
}

export const adminReviewFixture = {
  ...reviewFixture,
  id: 5, user_id: null, source: 'admin', author_name: 'Клиент 5', reviewer_name: 'Клиент 5',
  rating: 4, body: 'Работает стабильно второй месяц.', store_reply: null,
}

export const reviewsPageFixture = (items = [reviewFixture, adminReviewFixture]) => ({
  items, total: 51, page: 1, page_size: 10, total_pages: 6,
})

export const overviewFixture = {
  date_from: '2026-06-01', date_to: '2026-11-20',
  granularity: 'month' as const,
  completed_orders: 391, sold_units: 782, revenue: '22871420.00',
  review_count: 72, average_rating: 4.7,
  monthly: [
    { month: '2026-06-01', orders_count: 110, units_count: 95, amount: '2180000' },
    { month: '2026-07-01', orders_count: 121, units_count: 115, amount: '2640000' },
    { month: '2026-08-01', orders_count: 128, units_count: 130, amount: '3120000' },
    { month: '2026-09-01', orders_count: 132, units_count: 145, amount: '3640000' },
    { month: '2026-10-01', orders_count: 138, units_count: 160, amount: '4720000' },
    { month: '2026-11-01', orders_count: 129, units_count: 148, amount: '4380000' },
  ],
  top_products_by_sales: [
    { product_id: 13, name: 'AMD Ryzen 5 7600', sku: null, units: 124, amount: '2354760' },
    { product_id: 20, name: 'AMD Ryzen 7 5700X', sku: null, units: 103, amount: '2264970' },
  ],
  top_products_by_reviews: [
    { product_id: 7, name: 'RTX 4070 SUPER', sku: null, review_count: 58, average_rating: 4.9 },
    { product_id: 13, name: 'AMD Ryzen 5 7600', sku: null, review_count: 86, average_rating: 4.8 },
  ],
}

export const productStatFixture = {
  id: 13, slug: 'cpu-ryzen-5-7600', sku: 'CPU-AMD-7600', name: 'AMD Ryzen 5 7600',
  category: 'Процессоры', manufacturer: 'AMD', is_active: true,
  sold_units: 124, revenue: '2354760', orders_count: 40, review_count: 86, average_rating: 4.8,
}

export const productStatsPageFixture = {
  items: [productStatFixture],
  total: 10, page: 1, page_size: 10, total_pages: 1,
}

export const productStatsDetailFixture = {
  product: productStatFixture,
  date_from: null, date_to: null,
  granularity: 'month' as const,
  monthly: overviewFixture.monthly,
  rating_distribution: [
    { rating: 5, count: 54 }, { rating: 4, count: 7 }, { rating: 3, count: 6 },
    { rating: 2, count: 3 }, { rating: 1, count: 2 },
  ],
}

export const eventsFixture = {
  items: [
    {
      id: 247, event_key: 'build.created', occurred_at: '2026-11-17T14:52:00Z',
      actor_user_id: 104, actor_role: 'user', actor_username: 'IvanCool',
      category: 'build', event_type: 'build.created',
      outcome: 'success', target_type: 'build', target_id: 28, reason: null, details: {},
    },
    {
      id: 246, event_key: 'review.created', occurred_at: '2026-11-17T14:49:00Z',
      actor_user_id: 87, actor_role: 'user', actor_username: 'Alex',
      category: 'review', event_type: 'review.created',
      outcome: 'success', target_type: 'review', target_id: 31, reason: null, details: {},
    },
    {
      id: 245, event_key: 'auth.login_failed', occurred_at: '2026-11-17T14:40:00Z',
      actor_user_id: null, actor_role: null, actor_username: null,
      category: 'auth', event_type: 'auth.login_failed',
      outcome: 'failure', target_type: 'user', target_id: null, reason: 'Неверный пароль', details: {},
    },
  ],
  total: 247, page: 1, page_size: 10, total_pages: 25,
}

/**
 * One event per actor shape the journal has to render: ordinary user, admin,
 * owner, deleted user with a historical snapshot, deleted user without one and
 * a system-generated event. `actor_username` mirrors what the API resolves, so
 * the fixture matches the real `AdminEventOut` contract.
 */
export const eventsActorFixture = {
  items: [
    {
      id: 301, event_key: null, occurred_at: '2026-11-17T15:10:00Z',
      actor_user_id: 104, actor_role: 'user', actor_username: 'IvanCool',
      category: 'build', event_type: 'build.created',
      outcome: 'success', target_type: 'build', target_id: 28, reason: null, details: {},
    },
    {
      id: 302, event_key: null, occurred_at: '2026-11-17T15:05:00Z',
      actor_user_id: 42, actor_role: 'admin', actor_username: 'AdminMaster',
      category: 'admin', event_type: 'admin.user_status_changed',
      outcome: 'success', target_type: 'user', target_id: 87, reason: null, details: {},
    },
    {
      id: 303, event_key: null, occurred_at: '2026-11-17T15:00:00Z',
      actor_user_id: 1, actor_role: 'owner', actor_username: 'owner',
      category: 'admin', event_type: 'admin.user_role_changed',
      outcome: 'success', target_type: 'user', target_id: 42, reason: null,
      details: { from: 'user', to: 'admin' },
    },
    {
      id: 304, event_key: null, occurred_at: '2026-11-17T14:55:00Z',
      // Deleted account: no live row, but the recorded snapshot resolves it.
      actor_user_id: 56, actor_role: 'user', actor_username: 'DeletedIvan',
      category: 'account', event_type: 'account.deleted',
      outcome: 'success', target_type: null, target_id: null, reason: null,
      details: { actor_username: 'DeletedIvan' },
    },
    {
      id: 305, event_key: null, occurred_at: '2026-11-17T14:50:00Z',
      // Deleted account with neither a live row nor a historical snapshot.
      actor_user_id: 57, actor_role: 'admin', actor_username: null,
      category: 'account', event_type: 'account.deleted',
      outcome: 'success', target_type: null, target_id: null, reason: null, details: {},
    },
    {
      id: 306, event_key: null, occurred_at: '2026-11-17T14:45:00Z',
      actor_user_id: null, actor_role: null, actor_username: null,
      category: 'system', event_type: 'system.retention_cleanup',
      outcome: 'success', target_type: null, target_id: null, reason: null, details: {},
    },
  ],
  total: 6, page: 1, page_size: 10, total_pages: 1,
}

interface StubOptions {
  handler: (url: URL, init: RequestInit) => Response | Promise<Response> | undefined
}

/** Installs a fetch stub that always answers the header cart query. */
export function stubAdminFetch({ handler }: StubOptions) {
  const mock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname === '/api/v1/cart') return jsonResponse(cartFixture)
    const response = await handler(url, init)
    return response ?? jsonResponse({ detail: 'Not found' }, 404)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

export const callsTo = (mock: ReturnType<typeof vi.fn>, pathname: string) =>
  mock.mock.calls.filter(([url]) => new URL(String(url), 'http://localhost').pathname === pathname)

export const requestBody = (init: RequestInit): unknown =>
  typeof init.body === 'string' ? JSON.parse(init.body) : null
