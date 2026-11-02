import placeholder from '../assets/placeholder.jpg'
import { mockProducts, type Product } from './mockProducts'

export interface Review {
  id: number
  author: string
  date: string
  rating: number
  text: string
}

export interface DetailedSpec {
  label: string
  value: string
}

export interface EnrichedProduct extends Product {
  article: string
  rating: number
  reviewCount: number
  description: string
  detailedSpecs: DetailedSpec[]
  reviews: Review[]
  gallery: string[]
}

// Demo feedback, not real customer testimonials or verified purchases.
// Keep the data explicit rather than synthesizing artificial reviews/ratings.
const DEMO_REVIEWS: Record<string, Omit<Review, 'id'>[]> = {
  'Видеокарты': [
    { author: 'Александр К.', date: '2026-09-12', rating: 5, text: 'Демонстрационный отзыв: карточка видеокарты удобна для сравнения характеристик.' },
    { author: 'Ольга М.', date: '2026-08-24', rating: 4, text: 'Демонстрационный отзыв: хотелось бы больше фотографий товара.' },
    { author: 'Ирина П.', date: '2026-07-11', rating: 4, text: 'Демонстрационный отзыв: описание помогло ознакомиться с параметрами.' },
  ],
  'Процессоры': [
    { author: 'Никита С.', date: '2026-09-09', rating: 5, text: 'Демонстрационный отзыв: основные параметры процессора видны сразу.' },
    { author: 'Анна Б.', date: '2026-08-17', rating: 4, text: 'Демонстрационный отзыв: удобно смотреть сокет и количество ядер.' },
  ],
  'Материнские платы': [
    { author: 'Елена Т.', date: '2026-09-06', rating: 5, text: 'Демонстрационный отзыв: удобно проверять форм-фактор и тип памяти.' },
    { author: 'Андрей Ф.', date: '2026-08-19', rating: 4, text: 'Демонстрационный отзыв: информация о разъёмах пригодилась бы подробнее.' },
  ],
  'Готовые сборки': [
    { author: 'Кирилл Н.', date: '2026-09-16', rating: 5, text: 'Демонстрационный отзыв: состав сборки показан понятно.' },
    { author: 'Татьяна М.', date: '2026-08-20', rating: 4, text: 'Демонстрационный отзыв: удобно видеть основные комплектующие.' },
  ],
}

export function calculateRating(reviews: readonly Review[]): number {
  if (reviews.length === 0) return 0
  const total = reviews.reduce((sum, review) => sum + review.rating, 0)
  return Math.round((total / reviews.length) * 10) / 10
}

function detailSpecs(product: Product): DetailedSpec[] {
  const entries: DetailedSpec[] = []
  const add = (label: string, value: string | undefined) => {
    if (value?.trim()) entries.push({ label, value: value.trim() })
  }
  add('Производитель', product.manufacturer)

  if (product.category === 'Видеокарты') {
    const memory = product.specs.find((value) => /ГБ.*GDDR/.test(value))
    const bus = product.specs.find((value) => /бит/.test(value))
    const frequency = product.specs.find((value) => /\bМГц\b/.test(value))
    const technology = product.specs.find((value) => /DLSS|FSR/i.test(value))
    add('Разработчик графического процессора', product.graphicsChipBrand)
    add('Объём видеопамяти', memory?.match(/\d+\s*ГБ/)?.[0])
    add('Тип видеопамяти', memory?.match(/GDDR\d+X?/i)?.[0])
    add('Разрядность шины памяти', bus)
    add('Частота (согласно демо-данным)', frequency)
    add('Технология масштабирования', technology)
  } else if (product.category === 'Процессоры') {
    add('Количество ядер', product.specs.find((s) => /\d+\s*ядер|\d+\s*ядра|\d+\s*ядро/.test(s)))
    add('Количество потоков', product.specs.find((s) => /\d+\s*поток/.test(s)))
    add('Максимальная частота', product.specs.find((s) => /ГГц/.test(s)))
    add('Сокет', product.specs.find((s) => /AM\d|LGA\s*\d+/i.test(s)))
  } else if (product.category === 'Материнские платы') {
    add('Сокет', product.specs.find((s) => /AM\d|LGA\s*\d+/i.test(s)))
    add('Чипсет', product.name.match(/(B650E|B650|B760|Z790)/i)?.[0])
    add('Тип памяти', product.specs.find((s) => /DDR\d/i.test(s)))
    add('Форм-фактор', product.specs.find((s) => /^(ATX|mATX)$/i.test(s)))
    add('Wi-Fi', product.specs.find((s) => /WiFi/i.test(s)))
    add('Интерфейс расширения', product.specs.find((s) => /PCIe/i.test(s)))
  } else if (product.category === 'Готовые сборки') {
    add('Процессор', product.specs[0])
    add('Видеокарта', product.specs[1])
    add('Оперативная память', product.specs[2])
    add('Накопитель', product.specs[3])
  } else {
    product.specs.forEach((value, index) => add(`Параметр ${index + 1}`, value))
  }
  return entries
}

function description(product: Product): string {
  const details = product.specs.join(' · ')
  switch (product.category) {
    case 'Готовые сборки':
      return `${product.name} — демонстрационная конфигурация ПК. Состав сборки: ${details}. Точные условия поставки, совместимость и наличие будут уточняться после подключения каталога и серверной части.`
    case 'Видеокарты':
      return `${product.name} — видеокарта ${product.manufacturer}. Указанные характеристики: ${details}. Цена и наличие в этом каталоге демонстрационные.`
    case 'Процессоры':
      return `${product.name} — процессор ${product.manufacturer}. Основные характеристики: ${details}. Цена и наличие в этом каталоге демонстрационные.`
    case 'Материнские платы':
      return `${product.name} — материнская плата ${product.manufacturer}. Основные характеристики: ${details}. Перед подбором деталей проверьте сокет и совместимость с процессором.`
    default:
      return `${product.name}. Основные характеристики: ${details}.`
  }
}

function enrich(product: Product): EnrichedProduct {
  const reviews = (DEMO_REVIEWS[product.category] ?? []).map((review, index) => ({
    ...review,
    id: product.id * 1000 + index + 1,
  }))
  return {
    ...product,
    article: `SKU-${String(product.id).padStart(6, '0')}`, // Demo SKU from stable product ID
    rating: calculateRating(reviews),
    reviewCount: reviews.length,
    description: description(product),
    detailedSpecs: detailSpecs(product),
    reviews,
    gallery: [product.image || placeholder], // Do not invent or duplicate photo angles
  }
}

export function getProductDetail(slug: string): EnrichedProduct | null {
  const product = mockProducts.find((candidate) => candidate.slug === slug)
  return product ? enrich(product) : null
}
