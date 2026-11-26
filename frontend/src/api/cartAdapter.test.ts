import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { cartItems, orderFromServer } from './cartAdapter'
import type { CartOut, OrderOut } from './generated/model'
import type { RegularCartItem } from '../stores/cartStore'

const regularItem = (product: Record<string, unknown>) =>
  cartItems(cart(product))[0] as RegularCartItem

const cart = (product: Record<string, unknown>): CartOut => ({
  id: 3,
  items: [
    {
      id: 41,
      kind: 'product',
      product_id: 7,
      saved_build_id: null,
      product,
      build_snapshot: null,
      quantity: 1,
      unit_price: '64990.00',
      line_total: '64990.00',
      created_at: '2026-11-17T14:30:00Z',
      updated_at: '2026-11-17T14:30:00Z',
    },
  ],
  subtotal: '64990.00',
  item_count: 1,
  created_at: '2026-11-17T14:30:00Z',
  updated_at: '2026-11-17T14:30:00Z',
}) as CartOut

const baseProduct = {
  id: 7, slug: 'gpu-rtx-4070-super', name: 'MSI GeForce RTX 4070 SUPER',
  category: 'Видеокарты', specs: ['12 ГБ', 'GDDR6X'], price: '64990.00',
  cover_image_url: '/photo-1.png',
}

afterEach(async () => { await i18n.changeLanguage('ru') })

describe('cart adapter', () => {
  it('maps the structured short characteristics of a cart product', () => {
    const item = regularItem({
      ...baseProduct,
      short_characteristics: [
        {
          code: 'vram_gb', name: 'Объём видеопамяти', data_type: 'number', unit: 'ГБ',
          sort_order: 0, is_required: false, show_in_short: true, show_in_details: true,
          value: 12, display_value: '12 ГБ',
        },
        {
          code: 'vram_type', name: 'Тип видеопамяти', data_type: 'string', unit: null,
          sort_order: 1, is_required: false, show_in_short: true, show_in_details: true,
          value: 'GDDR6X', display_value: 'GDDR6X',
        },
      ],
    })
    expect(item.specs).toEqual(['12 ГБ', 'GDDR6X'])
    expect(item.characteristics).toEqual([
      {
        code: 'vram_gb', name: 'Объём видеопамяти', dataType: 'number', unit: 'ГБ',
        value: 12, displayValue: '12 ГБ', showInShort: true, showInDetails: true,
      },
      {
        code: 'vram_type', name: 'Тип видеопамяти', dataType: 'string', unit: null,
        value: 'GDDR6X', displayValue: 'GDDR6X', showInShort: true, showInDetails: true,
      },
    ])
  })

  it('keeps working when the API sends no structured rows', () => {
    const item = regularItem(baseProduct)
    expect(item.characteristics).toBeUndefined()
    expect(item.specs).toEqual(['12 ГБ', 'GDDR6X'])
  })

  it('ignores malformed rows instead of inventing characteristics', () => {
    const item = regularItem({
      ...baseProduct,
      short_characteristics: [
        { code: 12, name: 'Битый код', display_value: 'x' },
        'not-a-row',
        { code: 'vram_gb' },
      ],
    })
    expect(item.characteristics).toBeUndefined()
    expect(item.specs).toEqual(['12 ГБ', 'GDDR6X'])
  })
})

const buildItem = (name?: string) => ({
  id: 51,
  kind: 'custom_build',
  product_id: null,
  saved_build_id: 42,
  product: null,
  build_snapshot: {
    components: [
      { slot: 'cpu', product_id: 1, product_name: 'AMD Ryzen 5 7600', price: '18990.00' },
    ],
    total_price: '18990.00',
    ...(name === undefined ? {} : { name }),
  },
  quantity: 2,
  unit_price: '18990.00',
  line_total: '37980.00',
  created_at: '2026-11-17T14:30:00Z',
  updated_at: '2026-11-17T14:30:00Z',
})

const cartWith = (item: Record<string, unknown>) => ({
  id: 3, items: [item], subtotal: '37980.00', item_count: 2,
  created_at: '2026-11-17T14:30:00Z', updated_at: '2026-11-17T14:30:00Z',
}) as CartOut

describe('custom build names', () => {
  it('shows the captured saved-build name exactly as stored', async () => {
    const name = 'Игровой ПК «Титан» — 2026 ✦'
    const [item] = cartItems(cartWith(buildItem(name)))
    expect(item.name).toBe(name)
    expect('components' in item ? item.components : []).toHaveLength(1)

    // The same name is rendered unchanged in the English interface.
    await i18n.changeLanguage('en')
    expect(cartItems(cartWith(buildItem(name)))[0].name).toBe(name)
  })

  it('keeps the generic title for a configuration that was never named', () => {
    expect(cartItems(cartWith(buildItem()))[0].name).toBe('Сборка ПК')
  })

  it('reads the purchased name from the immutable order snapshot', () => {
    const name = 'Gaming PC 2026'
    const order = orderFromServer({
      id: 9, user_id: 7, status: 'completed_demo', total_amount: '37980.00', item_count: 2,
      created_at: '2026-11-17T14:30:00Z',
      items: [
        {
          id: 77, kind: 'custom_build', product_id: null, saved_build_id: null,
          sku_snapshot: null, name_snapshot: name, image_url_snapshot: null,
          unit_price: '18990.00', quantity: 2, line_total: '37980.00', specs_snapshot: [],
          components_snapshot: [
            { slot: 'cpu', product_id: 1, product_name: 'AMD Ryzen 5 7600', price: '18990.00' },
          ],
        },
      ],
    } as OrderOut)
    expect(order.items[0].name).toBe(name)
    expect(order.items[0].components).toHaveLength(1)
  })
})
