import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { cartItems } from './cartAdapter'
import type { CartOut } from './generated/model'
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
