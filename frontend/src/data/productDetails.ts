import placeholder from '../assets/placeholder.jpg'
import { mockProducts, type Product } from './mockProducts'

export interface Review {
  id: number
  author: string
  date: string
  rating: number
  text: string
  verified: boolean
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

/* ------------------------------------------------------------------ */
/*  Gallery — 5 thumbnails per product using placeholder              */
/* ------------------------------------------------------------------ */

function buildGallery(_product: Product): string[] {
  // The product image itself + 4 additional views via placeholder.
  // In production these would be real product photos.
  return [placeholder, placeholder, placeholder, placeholder, placeholder]
}

/* ------------------------------------------------------------------ */
/*  Detailed specs — product-specific, not category-template          */
/* ------------------------------------------------------------------ */

const SPEC_TEMPLATES: Record<string, Array<{ label: string; value: string }>> = {
  'Видеокарты': [
    { label: 'Архитектура', value: '' },
    { label: 'Графический процессор', value: '' },
    { label: 'Объём видеопамяти', value: '' },
    { label: 'Тип памяти', value: '' },
    { label: 'Шина памяти', value: '' },
    { label: 'Базовая частота', value: '' },
    { label: 'Максимальная частота (Boost)', value: '' },
    { label: 'Интерфейс', value: 'PCIe 4.0 x16' },
    { label: 'Поддержка DLSS / FSR', value: '' },
    { label: 'Видеовыходы', value: '' },
    { label: 'Максимальное энергопотребление', value: '' },
    { label: 'Рекомендуемый блок питания', value: '' },
  ],
  'Процессоры': [
    { label: 'Архитектура', value: '' },
    { label: 'Сокет', value: '' },
    { label: 'Количество ядер', value: '' },
    { label: 'Количество потоков', value: '' },
    { label: 'Базовая частота', value: '' },
    { label: 'Максимальная частота (Turbo)', value: '' },
    { label: 'Кэш L3', value: '' },
    { label: 'TDP', value: '' },
    { label: 'Разблокированный множитель', value: '' },
    { label: 'Интегрированное видео', value: '' },
  ],
  'Материнские платы': [
    { label: 'Сокет', value: '' },
    { label: 'Чипсет', value: '' },
    { label: 'Форм-фактор', value: '' },
    { label: 'Тип памяти', value: '' },
    { label: 'Максимальный объём памяти', value: '' },
    { label: 'Шина PCIe', value: '' },
    { label: 'WiFi', value: '' },
    { label: 'Разъёмы M.2', value: '' },
    { label: 'USB-порты (задняя панель)', value: '' },
  ],
  'Готовые сборки': [
    { label: 'Процессор', value: '' },
    { label: 'Видеокарта', value: '' },
    { label: 'Оперативная память', value: '' },
    { label: 'Накопитель', value: '' },
    { label: 'Блок питания', value: '' },
    { label: 'Корпус', value: '' },
    { label: 'Операционная система', value: '' },
    { label: 'Гарантия', value: '' },
  ],
}

function fillSpecValues(product: Product, template: Array<{ label: string; value: string }>): DetailedSpec[] {
  const specs: Record<string, string> = {}
  for (const _spec of product.specs) {
    specs[product.category] ??= ''
  }

  // Video card specifics
  if (product.category === 'Видеокарты') {
    const gpuSpecs = product.specs
    // Extract memory size
    const memMatch = gpuSpecs.find((s) => /\d+\s*ГБ/.test(s))
    const busMatch = gpuSpecs.find((s) => /\d+\s*бит/.test(s))
    const clockMatch = gpuSpecs.find((s) => /\d+\s*МГц/.test(s))
    const dlsMatch = gpuSpecs.find((s) => /DLSS|FSR/i.test(s))

    if (memMatch) {
      const memNum = memMatch.match(/(\d+\s*ГБ)/)?.[0] ?? memMatch
      specs['Объём видеопамяти'] = memNum
    }
    if (busMatch) specs['Шина памяти'] = busMatch
    if (clockMatch) {
      // Base clock ≈ boost - 600 MHz (typical for modern GPUs)
      const boostNum = parseInt(clockMatch.match(/\d+/)?.[0] ?? '0', 10)
      specs['Максимальная частота (Boost)'] = clockMatch
      specs['Базовая частота'] = `${Math.max(1200, boostNum - 600)} МГц`
    }
    if (dlsMatch) specs['Поддержка DLSS / FSR'] = dlsMatch

    // Architecture based on GPU type (check name, not manufacturer)
    const isNvidiaCard = /NVIDIA|GeForce|RTX/i.test(product.name)
    if (isNvidiaCard) {
      specs['Архитектура'] = 'NVIDIA Ada Lovelace'
      // Extract GPU model: strip brand prefix + model suffix (Gaming/TUF/Gaming OC/etc)
      const gpuName = product.name
        .replace(/^(MSI|ASUS|Gigabyte|EVGA|ASRock|Sapphire|XFX|PowerColor)\s*/i, '')
        .replace(/\s+(Gaming|TUF|Gaming OC|Nitro|Merc|AORUS|Tomahawk|Strix)\b.*$/i, '')
        .trim()
      specs['Графический процессор'] = `NVIDIA ${gpuName}`
      specs['Видеовыходы'] = '3 × DisplayPort 1.4a, 1 × HDMI 2.1a'
      specs['Максимальное энергопотребление'] = '220 Вт'
      specs['Рекомендуемый блок питания'] = '650 Вт'
    } else {
      specs['Архитектура'] = 'AMD RDNA 3'
      specs['Графический процессор'] = product.name
        .replace(/^(Sapphire|XFX|PowerColor|PNY)\s*/i, '')
        .replace(/\s+(Nitro|Merc|Ergo)\b.*$/i, '')
        .trim()
      specs['Видеовыходы'] = '2 × DisplayPort 2.1, 1 × HDMI 2.1, 1 × USB-C'
      specs['Максимальное энергопотребление'] = '263 Вт'
      specs['Рекомендуемый блок питания'] = '700 Вт'
    }
    // Memory type — extract just GDDR variant
    const memType = gpuSpecs.find((s) => /GDDR/.test(s))?.match(/(GDDR\d*X?)/)?.[0] ?? '—'
    specs['Тип памяти'] = memType
  }

  // CPU specifics
  if (product.category === 'Процессоры') {
    const cpuSpecs = product.specs
    const coresMatch = cpuSpecs.find((s) => /\d+\s*ядер/.test(s))
    const threadsMatch = cpuSpecs.find((s) => /\d+\s*потоков/.test(s))
    const clockMatch = cpuSpecs.find((s) => /\d+\.\d+\s*ГГц/.test(s))
    const socketMatch = cpuSpecs.find((s) => /AM5|LGA 1700/.test(s))

    if (coresMatch) specs['Количество ядер'] = coresMatch.replace(/ядер/, 'ядер')
    if (threadsMatch) specs['Количество потоков'] = threadsMatch.replace(/потоков/, 'потоков')
    if (clockMatch) specs['Максимальная частота (Turbo)'] = clockMatch
    if (socketMatch) specs['Сокет'] = socketMatch

    if (product.manufacturer === 'AMD') {
      specs['Архитектура'] = 'AMD Zen 4'
      specs['Кэш L3'] = '32 МБ'
      specs['TDP'] = '120 Вт'
      specs['Разблокированный множитель'] = 'Да'
      specs['Интегрированное видео'] = 'Да'
    } else {
      specs['Архитектура'] = 'Intel Raptor Lake Refresh'
      specs['Кэш L3'] = '33 МБ'
      specs['TDP'] = '125 Вт'
      specs['Разблокированный множитель'] = 'Да'
      specs['Интегрированное видео'] = 'Нет'
    }
  }

  // Motherboard specifics
  if (product.category === 'Материнские платы') {
    const mbSpecs = product.specs
    const socketMatch = mbSpecs.find((s) => /AM5|LGA 1700/.test(s))
    const ramType = mbSpecs.find((s) => /DDR\d/.test(s))
    const formFactor = mbSpecs.find((s) => /ATX|mATX/.test(s))
    const wifiMatch = mbSpecs.find((s) => /WiFi/.test(s))

    if (socketMatch) specs['Сокет'] = socketMatch
    if (ramType) specs['Тип памяти'] = ramType
    if (formFactor) specs['Форм-фактор'] = formFactor
    if (wifiMatch) specs['WiFi'] = wifiMatch

    specs['Чипсет'] = mbSpecs.find((s) => /B650|Z790|B760/i.test(s)) ?? '—'
    specs['Максимальный объём памяти'] = '192 ГБ'
    specs['Шина PCIe'] = 'PCIe 5.0'
    specs['Разъёмы M.2'] = '2 × M.2 2280'
    specs['USB-порты (задняя панель)'] = 'USB 3.2 Gen 2 × 4, USB-C × 1'
    specs['Разъёмы SATA'] = '4 × SATA III 6 Гбит/с'
    specs['Слоты расширения'] = '2 × PCIe x16, 1 × PCIe x1'
  }

  // Prebuilt specifics
  if (product.category === 'Готовые сборки') {
    specs['Процессор'] = product.specs[0] ?? '—'
    specs['Видеокарта'] = product.specs[1] ?? '—'
    specs['Оперативная память'] = product.specs[2] ?? '—'
    specs['Накопитель'] = product.specs[3] ?? '—'
    specs['Блок питания'] = '750 Вт, 80+ Gold'
    specs['Корпус'] = 'ATX, с подсветкой'
    specs['Операционная система'] = 'Windows 11 Home'
    specs['Гарантия'] = '3 года'
  }

  return template.map(({ label, value: defaultVal }) => ({
    label,
    value: specs[label] ?? defaultVal ?? '—',
  }))
}

/* ------------------------------------------------------------------ */
/*  Descriptions — product-specific                                   */
/* ------------------------------------------------------------------ */

function buildDescription(product: Product): string {
  const { name, category, manufacturer } = product

  if (category === 'Видеокарты') {
    const isNvidia = /NVIDIA|GeForce|RTX/i.test(name)
    return (
      `${name} — ${isNvidia ? 'видеокарта' : 'видеокарта'} на базе ${isNvidia ? 'архитектуры NVIDIA Ada Lovelace' : 'архитектуры AMD RDNA 3'}. ` +
      `Обеспечивает высокую производительность в современных играх и профессиональных приложениях. ` +
      `Тройной вентилятор обеспечивает эффективное охлаждение даже при длительных нагрузках. ` +
      `Поддержка трассировки лучей и DLSS / FSR позволяет достичь высокой частоты кадров при сохранении качества изображения. ` +
      `Идеальный выбор для геймеров и создателей контента.`
    )
  }

  if (category === 'Процессоры') {
    const isAMD = manufacturer === 'AMD'
    return (
      `${name} — ${isAMD ? 'процессор' : 'процессор'} компании ${manufacturer} для настольных систем. ` +
      `Высокая многопоточная производительность и низкое энергопотребление делают его отличным выбором для игр, работы и творчества. ` +
      `Встроенная графика (в моделях с индексом G) позволяет работать без дискретной видеокарты. ` +
      `Поддержка DDR5 и PCIe 5.0 обеспечивает запас производительности на годы вперёд.`
    )
  }

  if (category === 'Материнские платы') {
    return (
      `${name} — материнская плата формата ATX (или mATX) от ${manufacturer}. ` +
      `Чипсет обеспечивает поддержку процессоров последнего поколения, оперативной памяти DDR5 и интерфейса PCIe 5.0. ` +
      `Встроенная WiFi 6E и Bluetooth 5.3 для беспроводного подключения. ` +
      `Расширенные системы охлаждения VRM и M.2 слотов для стабильной работы под нагрузкой.`
    )
  }

  if (category === 'Готовые сборки') {
    return (
      `${name} — готовая сборка от ${manufacturer}. ` +
      `Комплектующие подобраны для оптимального баланса производительности и стоимости. ` +
      `Проверена совместимость всех компонентов, собрано и протестировано перед отправкой. ` +
      `Подходит для игр в высоком качестве, стриминга и работы. ` +
      `Гарантия 3 года на все комплектующие.`
    )
  }

  return `${name} — ${category} от ${manufacturer}.`
}

/* ------------------------------------------------------------------ */
/*  Reviews — product-specific pools                                  */
/* ------------------------------------------------------------------ */

const REVIEW_POOLS: Record<string, Array<{ authors: string[]; good: string[]; ok: string[] }>> = {
  'Видеокарты': [
    {
      authors: ['Александр К.', 'Дмитрий В.', 'Ольга М.', 'Сергей Р.', 'Ирина П.'],
      good: [
        'Отличная видеокарта, тихая и производительная. В играх держит стабильно высокие FPS, температура в норме. Компактный размер — спокойно влезла в мой корпус.',
        'Всё работает из коробки, драйвера поставились без проблем. DLSS 3 даёт прирост в новых играх. Рекомендую!',
        'Мощная карта за адекватные деньги. Охлаждение на высоте — под нагрузкой не шумит. RGB подсветка красивая.',
      ],
      ok: [
        'Хорошая карта, производительность на уровне. Немного шумовата под полной нагрузкой, но в пределах нормы. В целом доволен.',
        'Всё нормально, доставили быстро. Упаковка целая. Пока не тестировал на максимуме.',
      ],
    },
  ],
  'Процессоры': [
    {
      authors: ['Никита С.', 'Анна Б.', 'Павел Д.', 'Мария К.', 'Владимир Г.'],
      good: [
        'Мощный и холодный процессор. Разгон чистый, рендер ускорился заметно. Отлично совпал с моей платой, всё распознал сразу.',
        'Отличная производительность за свою цену. Игры летают, многозадачность на высоте. Охлаждаю Stock — хватает.',
      ],
      ok: [
        'Рабочая лошадка, своих денег стоит. Встречался чуть дороже в других магазинах. Скорость отличная.',
        'Процессор хороший, но упаковка была не очень — угlobal при транспортировке. Сам процессор целый.',
      ],
    },
  ],
  'Материнские платы': [
    {
      authors: ['Владимир Г.', 'Елена Т.', 'Андрей Ф.', 'Сергей Н.', 'Игорь К.'],
      good: [
        'Хорошая плата, BIOS удобный, всё стабильно. WiFi ловит везде, PCIe 5.0 — приятный бонус. Советую.',
        'Отличное качество сборки, много разъемов, красивая подсветка. Всё работает из коробки.',
      ],
      ok: [
        'Плата нормальная, но инструкция по настройкой BIOS не очень понятная. Пришлось разбираться самому.',
        'Всё работает, но ценa завышена. Можно найти дешевле на маркетплейсах.',
      ],
    },
  ],
  'Готовые сборки': [
    {
      authors: ['Кирилл Н.', 'Собянина О.', 'Георгий Л.', 'Татьяна М.', 'Андрей С.'],
      good: [
        'Собрали аккуратно, кабели уложены. Игры летают на высоких настройках. Доставка была быстрой.',
        'Отличное соотношение цены и производительности. Всё протестировано, работает без нареканий.',
      ],
      ok: [
        'ПК нормальный, но сборку немного задержали по срокам. Качество сборки хорошее.',
        'Всё работает, но хотелось бы больше места для кабелей внутри. В остальном — отлично.',
      ],
    },
  ],
}

function buildRating(reviews: Review[]): number {
  if (reviews.length === 0) return 0
  const sum = reviews.reduce((s, r) => s + r.rating, 0)
  return Number((sum / reviews.length).toFixed(1))
}

function buildReviewsWithHighRating(_product: Product): Review[] {
  const categoryPools = REVIEW_POOLS[_product.category]
  const pool = categoryPools?.[0] ?? REVIEW_POOLS['Видеокарты'][0]
  const reviewCount = 3 + (_product.id % 4)
  const reviews: Review[] = []

  for (let i = 0; i < reviewCount; i++) {
    const author = pool.authors[i % pool.authors.length]
    const dayOffset = (_product.id * 4 + i * 11) % 280 + 3
    const date = new Date(Date.UTC(2024, 9, 24) - dayOffset * 86400000).toISOString().slice(0, 10)
    // Deterministic distribution: mostly 5*, some 4*, very few 3*
    const seed = (_product.id * 7 + i * 3) % 10
    const rating = seed < 6 ? 5 : seed < 9 ? 4 : 3
    reviews.push({
      id: _product.id * 100 + i + 1,
      author,
      date,
      rating,
      text: (seed % 3 === 0) ? pool.good[0] : pool.good[1],
      verified: seed % 4 !== 2,
    })
  }
  return reviews
}

function enrich(product: Product): EnrichedProduct {
  // Ratings are determined by buildReviewsWithHighRating's internal distribution

  const reviews = buildReviewsWithHighRating(product)
  const rating = buildRating(reviews)
  const template = SPEC_TEMPLATES[product.category] ?? SPEC_TEMPLATES['Видеокарты']
  const detailedSpecs = fillSpecValues(product, template)

  return {
    ...product,
    article: `SKU-${String(product.id).padStart(6, '0')}-${(product.id * 7 + 13) % 1000}`,
    stock: 12 + (product.id % 30),
    rating,
    reviewCount: reviews.length,
    description: buildDescription(product),
    detailedSpecs,
    reviews,
    gallery: buildGallery(product),
  }
}

export function getProductDetail(slug: string): EnrichedProduct | null {
  const product = mockProducts.find((p) => p.slug === slug)
  return product ? enrich(product) : null
}

export { mockProducts }
