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
  stock: number
  rating: number
  reviewCount: number
  description: string
  detailedSpecs: DetailedSpec[]
  reviews: Review[]
  gallery: string[]
}

// Deterministic pseudo-random helper so demo data is stable across renders.
function seeded(seed: number): () => number {
  let state = seed || 1
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

// Realistic-looking 10-digit SKU derived deterministically from the product id.
function makeArticle(id: number): string {
  const seed = (id * 2654435761) >>> 0
  const head = String(seed % 900000000 + 100000000)
  const tail = String((seed * 7 + id) % 1000000000).padStart(9, '0')
  return `${head.slice(0, 1)}${tail.slice(1)}`
}

// Per-category detailed specs. Labels come first, then value — matching the
// reference ("лидеры между ключом и значением в характеристиках").
// Review text pools per category so cards read naturally for any product.
const REVIEW_POOLS: Record<string, { authors: string[]; good: string[]; ok: string[] }> = {
  'Видеокарты': {
    authors: ['Александр К.', 'Дмитрий В.', 'Ольга М.', 'Сергей Р.', 'Ирина П.'],
    good: [
      'Отличная карта, тихая и производительная. В играх держит стабильно высокие FPS, температура в норме.',
      'Компактный размер — спокойно влезла в мой корпус. Очень доволен покупкой!',
      'Всё работает из коробки, драйвера поставились без проблем. Рекомендую.',
    ],
    ok: [
      'Хорошая карта, производительность на высоте. Немножно шумовата под нагрузкой, но в пределах нормы.',
      'В целом рекомендую. Упаковка целая, доставили быстро.',
    ],
  },
  'Процессоры': {
    authors: ['Никита С.', 'Анна Б.', 'Павел Д.', 'Мария К.'],
    good: [
      'Мощный и холодный, разгон чистый. Рендер ускорился заметно.',
      'Отлично совпал с моей платой, всё распознал сразу.',
    ],
    ok: [
      'Рабочая лошадка, своих денег стоит. Встречался чуть дороже в других магазинах.',
    ],
  },
  'Материнские платы': {
    authors: ['Владимир Г.', 'Елена Т.', 'Андрей Ф.'],
    good: [
      'Хорошая плата, BIOS удобный, всё стабильно. WiFi ловит везде.',
      'Отличное качество сборки, много разъемов. Советую.',
    ],
    ok: [
      'Плата нормальная, но инструкция по настройкой BIOS не очень понятная.',
    ],
  },
  'Готовые сборки': {
    authors: ['Кирилл Н.', 'Собянина О.', 'Георгий Л.'],
    good: [
      'Собрали аккуратно, кабели уложены. Игры летают на высоких настройках.',
      'Доставили быстро, всё работает. Отношение к качеству видно.',
    ],
    ok: [
      'ПК нормальный, но сборку немного запаздала по срокам.',
    ],
  },
}

function extractValues(product: Product): string[] {
  // Split the existing specs string on the bullet separator used across mock data.
  return product.specs
    .flatMap((spec) => spec.split(' • '))
    .map((part) => part.trim())
    .filter(Boolean)
}

// Realistic per-category templates. Values that can be derived from the product
// specs (memory, clock) are substituted dynamically so cards are not identical.
const SPEC_TEMPLATES: Record<string, { label: string; value: string }[]> = {
  'Видеокарты': [
    { label: 'Архитектура', value: 'NVIDIA Ada Lovelace' },
    { label: 'Объём видеопамяти', value: '12 ГБ' },
    { label: 'Тип памяти', value: 'GDDR6X' },
    { label: 'Шина памяти', value: '192 бит' },
    { label: 'Базовая частота', value: '1800 МГц' },
    { label: 'Частота буста', value: '2472 МГц' },
    { label: 'Интерфейс', value: 'PCIe 4.0 x16' },
    { label: 'Поддержка DLSS', value: 'DLSS 3' },
    { label: 'Виде выходы', value: '3× DisplayPort 1.4a, 1× HDMI 2.1a' },
    { label: 'Максимальное энергопотребление', value: '250 Вт' },
    { label: 'Рекомендуемый блок питания', value: '650 Вт' },
    { label: 'Тип подсветки', value: 'RGB LED' },
  ],
  'Процессоры': [
    { label: 'Архитектура', value: 'Zen 4' },
    { label: 'Сокет', value: 'AM5' },
    { label: 'Количество ядер', value: '8' },
    { label: 'Количество потоков', value: '16' },
    { label: 'Базовая частота', value: '4.2 ГГц' },
    { label: 'Частота буста', value: '5.0 ГГц' },
    { label: 'Кэш L3', value: '32 МБ' },
    { label: 'TDP', value: '120 Вт' },
    { label: 'Разблокированный множитель', value: 'Да' },
    { label: 'Интегрированное видео', value: 'Нет' },
    { label: 'Дисплей', value: '—' },
  ],
  'Материнские платы': [
    { label: 'Сокет', value: 'AM5' },
    { label: 'Чипсет', value: 'B650' },
    { label: 'Форм-фактор', value: 'ATX' },
    { label: 'Тип памяти', value: 'DDR5' },
    { label: 'Максимальный объём', value: '192 ГБ' },
    { label: 'Шина PCIe', value: 'PCIe 5.0' },
    { label: 'WiFi', value: 'WiFi 6E' },
    { label: 'Разгон памяти', value: 'Да' },
    { label: 'Виде выходы', value: '3× DisplayPort 1.4a, 1× HDMI 2.1a' },
  ],
  'Готовые сборки': [
    { label: 'Процессор', value: 'AMD Ryzen 7 7800X3D' },
    { label: 'Видеокарта', value: 'MSI GeForce RTX 4070 SUPER' },
    { label: 'Оперативная память', value: '32 ГБ DDR5' },
    { label: 'Накопитель', value: '1 ТБ NVMe SSD' },
    { label: 'Блок питания', value: '750 Вт, 80+ Gold' },
    { label: 'Корпус', value: 'ATX, с подсветкой' },
    { label: 'Операционная система', value: 'Windows 11 Home' },
    { label: 'Гарантия', value: '3 года' },
  ],
}

function buildDetailedSpecs(product: Product): DetailedSpec[] {
  const templates = SPEC_TEMPLATES[product.category] ?? SPEC_TEMPLATES['Видеокарты']
  const values = extractValues(product)

  // Derive memory amount and clock from specs when present.
  const memValue = values.find((v) => /ГБ/.test(v))
  const clockValue = values.find((v) => /МГц/.test(v))

  return templates.map(({ label, value }) => {
    if (/(Объём видеопамяти|Памяти)$/.test(label) && memValue) {
      const match = memValue.match(/(\d+) ГБ/);
      return { label, value: match ? `${match[1]} ГБ` : memValue };
    }
    if (/Частота/i.test(label) && clockValue) {
      const num = parseInt(clockValue.match(/\d+/)?.[0] ?? '0', 10);
      const base = /Базовая/i.test(label) ? Math.max(1, num - 300) : num;
      return { label, value: `${base} МГц` };
    }
    return { label, value };
  })
}

function buildReviews(product: Product): Review[] {
  const pool = REVIEW_POOLS[product.category] ?? REVIEW_POOLS['Видеокарты']
  const count = 3 + (product.id % 3)
  const reviews: Review[] = []
  for (let i = 0; i < count; i++) {
    const rnd = seeded(product.id * 13 + i * 3)
    const author = pool.authors[(product.id + i) % pool.authors.length]
    const isGood = rnd() > 0.4
    const text = (isGood ? pool.good : pool.ok)[i % (isGood ? pool.good.length : pool.ok.length)]
    const dayOffset = (product.id * 4 + i * 11) % 280 + 3
    const date = new Date(Date.UTC(2024, 9, 24) - dayOffset * 86400000).toISOString().slice(0, 10)
    const rating = isGood ? 4 + Math.floor(rnd() * 1.5) : 3 + Math.floor(rnd() * 1)
    reviews.push({
      id: product.id * 100 + i,
      author,
      date,
      rating: Math.min(5, Math.max(1, rating)),
      text,
    })
  }
  return reviews
}

function buildGallery(product: Product): string[] {
  // Frame-filling demo tiles: a colored card with the category name. Each slot
  // has a distinct background so thumbnail switching is clearly visible. No
  // nested data URIs — a single self-contained SVG per slot.
  const slotColors = ['#dbeafe', '#dcfce7', '#fef9c3']
  return [0, 0, 0].map((_, index) => {
    const bg = slotColors[index]
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'><rect width='240' height='240' fill='${bg}'/><rect x='36' y='52' width='168' height='136' rx='16' fill='%23ffffff' opacity='0.9'/><rect x='36' y='52' width='168' height='136' rx='16' fill='none' stroke='%23cbd5e1' stroke-width='2'/><text x='120' y='210' font-family='sans-serif' font-size='18' font-weight='600' fill='%23475569' text-anchor='middle'>${product.category}</text></svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
  })
}

function buildDescription(product: Product): string {
  const categoryLabel = product.category
  const maker = product.manufacturer
  return (
    `${product.name} — ${categoryLabel.toLowerCase()} от «${maker}», сочетающая высокую производительность и стабильную работу.` +
    ' Разработан для решётных задач: от повседневного использования до нагруженных игровых и рабочих сценариев.' +
    ' Продуманная система охлаждения и надёжные компоненты обеспечивают долгий срок службы и стабильность в любых условиях.'
  )
}

function enrich(product: Product): EnrichedProduct {
  const reviews = buildReviews(product)
  const rating = Number((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1))
  const rnd = seeded(product.id * 17)
  return {
    ...product,
    article: makeArticle(product.id),
    stock: 3 + Math.floor(rnd() * 45),
    rating,
    reviewCount: reviews.length,
    description: buildDescription(product),
    detailedSpecs: buildDetailedSpecs(product),
    reviews,
    gallery: buildGallery(product),
  }
}

// Enriched lookup by slug. Returns null for unknown slugs (handled as 404).
export function getProductDetail(slug: string): EnrichedProduct | null {
  const product = mockProducts.find((p) => p.slug === slug)
  return product ? enrich(product) : null
}

export { mockProducts }
