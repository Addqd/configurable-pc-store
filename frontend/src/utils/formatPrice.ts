import i18n from '../i18n'

export function formatPrice(price: number): string {
  return new Intl.NumberFormat(i18n.resolvedLanguage === 'en' ? 'en-GB' : 'ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(price)
}
