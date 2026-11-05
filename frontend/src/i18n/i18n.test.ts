import { describe, expect, it, afterEach } from 'vitest'
import i18n, { saveLanguage } from './index'
import { catalogDisplay } from './catalogDisplay'
import { localeDate } from './format'
import { formatPrice } from '../utils/formatPrice'

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const name = prefix ? `${prefix}.${key}` : key
    return entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.entries(flatten(entry as Record<string, unknown>, name))
      : [[name, String(entry)]]
  }))
}

afterEach(async () => { await i18n.changeLanguage('ru') })

describe('TASK 008 localization', () => {
  it('has identical RU/EN resource keys and interpolation variables', () => {
    const a = flatten(i18n.getResourceBundle('ru', 'translation'))
    const b = flatten(i18n.getResourceBundle('en', 'translation'))
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
    for (const key of Object.keys(a)) {
      const vars = (text: string) => [...text.matchAll(/\{\{\s*([^} ]+)\s*\}\}/g)].map(x => x[1]).sort()
      expect(vars(a[key])).toEqual(vars(b[key]))
    }
  })

  it('supports CLDR plurals in both locales', async () => {
    await i18n.changeLanguage('ru')
    expect(i18n.t('common.items', { count: 1 })).toBe('1 товар')
    expect(i18n.t('common.items', { count: 2 })).toBe('2 товара')
    expect(i18n.t('common.items', { count: 5 })).toBe('5 товаров')
    await i18n.changeLanguage('en')
    expect(i18n.t('common.items', { count: 1 })).toBe('1 item')
    expect(i18n.t('common.items', { count: 5 })).toBe('5 items')
  })

  it('preserves internal catalog strings when displayed in EN', async () => {
    await i18n.changeLanguage('en')
    const internalCategory = 'Видеокарты'
    expect(catalogDisplay(internalCategory)).toBe('Graphics cards')
    expect(internalCategory).toBe('Видеокарты')
    expect(catalogDisplay('16 ГБ DDR5')).toBe('16 GB DDR5')
  })

  it('persists the language choice and formats RUB without converting amounts', async () => {
    await i18n.changeLanguage('en')
    saveLanguage('en')
    expect(localStorage.getItem('pc-builder-lang')).toBe('en')
    expect(formatPrice(64990)).toMatch(/64[,\s]990|64.990/)
    expect(localeDate(Date.UTC(2026, 10, 5))).toMatch(/05|5/)
    saveLanguage('ru')
  })
})
