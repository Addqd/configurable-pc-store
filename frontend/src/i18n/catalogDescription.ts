import type { EnrichedProduct } from '../data/productDetails'
import i18n from './index'
import { catalogDisplay } from './catalogDisplay'

export function localizedDescription(product: EnrichedProduct): string {
  if (i18n.resolvedLanguage !== 'en') return product.description
  const name = catalogDisplay(product.name)
  const details = product.specs.map((spec) => catalogDisplay(spec)).join(' · ')
  switch (product.category) {
    case 'Готовые сборки':
      return `${name} is a demo PC configuration. Components: ${details}. Delivery terms, compatibility and stock availability will be confirmed once the backend and catalog are connected.`
    case 'Видеокарты':
      return `${name} is a ${product.manufacturer} graphics card. Listed specifications: ${details}. Prices and availability are for demonstration purposes.`
    case 'Процессоры':
      return `${name} is a ${product.manufacturer} processor. Key specifications: ${details}. Prices and availability are for demonstration purposes.`
    case 'Материнские платы':
      return `${name} is a ${product.manufacturer} motherboard. Key specifications: ${details}. Check socket and CPU compatibility before choosing components.`
    default:
      return `${name}. Key specifications: ${details}.`
  }
}
