import placeholder from '../assets/placeholder.jpg'

export interface Product {
  id: number
  name: string
  category: string
  manufacturer: string
  specs: string[]
  price: number
  image: string
  slug: string
}

export const mockProducts: Product[] = [
  // Готовые сборки
  {
    id: 1,
    name: 'Игровой ПК PowerPlay',
    category: 'Готовые сборки',
    manufacturer: 'PC Builder',
    specs: ['Ryzen 7 5700X • RTX 4060 Ti', '16 ГБ DDR5 • 1 ТБ SSD'],
    price: 89990,
    image: placeholder,
    slug: 'gaming-pc-powerplay',
  },
  {
    id: 2,
    name: 'Игровой ПК Ultra',
    category: 'Готовые сборки',
    manufacturer: 'PC Builder',
    specs: ['i5-14600KF • RTX 4070', '32 ГБ DDR5 • 1 ТБ SSD'],
    price: 124990,
    image: placeholder,
    slug: 'gaming-pc-ultra',
  },
  {
    id: 3,
    name: 'Игровой ПК ProMax',
    category: 'Готовые сборки',
    manufacturer: 'PC Builder',
    specs: ['Ryzen 9 7900X • RTX 4080', '64 ГБ DDR5 • 2 ТБ SSD'],
    price: 189990,
    image: placeholder,
    slug: 'gaming-pc-promax',
  },
  {
    id: 4,
    name: 'Стриминговый ПК StreamX',
    category: 'Готовые сборки',
    manufacturer: 'PC Builder',
    specs: ['Ryzen 7 7800X3D • RTX 4070 Ti', '32 ГБ DDR5 • 2 ТБ SSD'],
    price: 159990,
    image: placeholder,
    slug: 'streaming-pc-streamx',
  },
  {
    id: 5,
    name: 'Рабочая станция WorkPro',
    category: 'Готовые сборки',
    manufacturer: 'PC Builder',
    specs: ['Threadripper PRO 7945WX • RTX 6000', '128 ГБ ECC DDR5 • 4 ТБ NVMe'],
    price: 459990,
    image: placeholder,
    slug: 'workstation-workpro',
  },
  {
    id: 6,
    name: 'Компактный ПК MiniCube',
    category: 'Готовые сборки',
    manufacturer: 'PC Builder',
    specs: ['Ryzen 5 7600 • RX 7600 XT', '16 ГБ DDR5 • 512 ГБ SSD'],
    price: 64990,
    image: placeholder,
    slug: 'compact-pc-minicube',
  },

  // Видеокарты
  {
    id: 7,
    name: 'GeForce RTX 4070 SUPER',
    category: 'Видеокарты',
    manufacturer: 'NVIDIA',
    specs: ['12 ГБ GDDR6X • 2472 МГц'],
    price: 64990,
    image: placeholder,
    slug: 'gpu-rtx-4070-super',
  },
  {
    id: 8,
    name: 'GeForce RTX 4070 Ti SUPER',
    category: 'Видеокарты',
    manufacturer: 'NVIDIA',
    specs: ['16 ГБ GDDR6X • 2610 МГц'],
    price: 89990,
    image: placeholder,
    slug: 'gpu-rtx-4070-ti-super',
  },
  {
    id: 9,
    name: 'GeForce RTX 4080 SUPER',
    category: 'Видеокарты',
    manufacturer: 'NVIDIA',
    specs: ['16 ГБ GDDR6X • 2550 МГц'],
    price: 109990,
    image: placeholder,
    slug: 'gpu-rtx-4080-super',
  },
  {
    id: 10,
    name: 'Radeon RX 7800 XT',
    category: 'Видеокарты',
    manufacturer: 'AMD',
    specs: ['16 ГБ GDDR6 • 2430 МГц'],
    price: 54990,
    image: placeholder,
    slug: 'gpu-rx-7800-xt',
  },
  {
    id: 11,
    name: 'Radeon RX 7900 GRE',
    category: 'Видеокарты',
    manufacturer: 'AMD',
    specs: ['16 ГБ GDDR6 • 2361 МГц'],
    price: 64990,
    image: placeholder,
    slug: 'gpu-rx-7900-gre',
  },
  {
    id: 12,
    name: 'GeForce RTX 4090',
    category: 'Видеокарты',
    manufacturer: 'NVIDIA',
    specs: ['24 ГБ GDDR6X • 2520 МГц'],
    price: 189990,
    image: placeholder,
    slug: 'gpu-rtx-4090',
  },

  // Процессоры
  {
    id: 13,
    name: 'AMD Ryzen 5 7600',
    category: 'Процессоры',
    manufacturer: 'AMD',
    specs: ['6 ядер • 12 потоков • 5.1 ГГц • AM5'],
    price: 18990,
    image: placeholder,
    slug: 'cpu-ryzen-5-7600',
  },
  {
    id: 14,
    name: 'AMD Ryzen 7 7800X3D',
    category: 'Процессоры',
    manufacturer: 'AMD',
    specs: ['8 ядер • 16 потоков • 5.0 ГГц • AM5'],
    price: 34990,
    image: placeholder,
    slug: 'cpu-ryzen-7-7800x3d',
  },
  {
    id: 15,
    name: 'Intel Core i5-14600KF',
    category: 'Процессоры',
    manufacturer: 'Intel',
    specs: ['14 ядер • 20 потоков • 5.3 ГГц • LGA 1700'],
    price: 24990,
    image: placeholder,
    slug: 'cpu-core-i5-14600kf',
  },
  {
    id: 16,
    name: 'Intel Core i7-14700KF',
    category: 'Процессоры',
    manufacturer: 'Intel',
    specs: ['20 ядер • 28 потоков • 5.6 ГГц • LGA 1700'],
    price: 38990,
    image: placeholder,
    slug: 'cpu-core-i7-14700kf',
  },
  {
    id: 17,
    name: 'AMD Ryzen 9 7950X',
    category: 'Процессоры',
    manufacturer: 'AMD',
    specs: ['16 ядер • 32 потока • 5.7 ГГц • AM5'],
    price: 54990,
    image: placeholder,
    slug: 'cpu-ryzen-9-7950x',
  },
  {
    id: 18,
    name: 'Intel Core i9-14900KF',
    category: 'Процессоры',
    manufacturer: 'Intel',
    specs: ['24 ядра • 32 потока • 6.0 ГГц • LGA 1700'],
    price: 69990,
    image: placeholder,
    slug: 'cpu-core-i9-14900kf',
  },

  // Материнские платы
  {
    id: 19,
    name: 'MSI MAG B650 Tomahawk WiFi',
    category: 'Материнские платы',
    manufacturer: 'MSI',
    specs: ['AM5 • DDR5 • ATX • WiFi 6E'],
    price: 22990,
    image: placeholder,
    slug: 'mobo-msi-b650-tomahawk',
  },
  {
    id: 20,
    name: 'ASUS ROG Strix B650E-F',
    category: 'Материнские платы',
    manufacturer: 'ASUS',
    specs: ['AM5 • DDR5 • ATX • PCIe 5.0'],
    price: 34990,
    image: placeholder,
    slug: 'mobus-rog-strix-b650e-f',
  },
  {
    id: 21,
    name: 'Gigabyte Z790 AORUS Elite',
    category: 'Материнские платы',
    manufacturer: 'Gigabyte',
    specs: ['LGA 1700 • DDR5 • ATX • WiFi 6E'],
    price: 29990,
    image: placeholder,
    slug: 'mobo-gigabyte-z790-aorus',
  },
  {
    id: 22,
    name: 'MSI MAG B760 Tomahawk',
    category: 'Материнские платы',
    manufacturer: 'MSI',
    specs: ['LGA 1700 • DDR5 • ATX'],
    price: 18990,
    image: placeholder,
    slug: 'mobo-msi-b760-tomahawk',
  },
  {
    id: 23,
    name: 'ASUS TUF Gaming Z790-Plus',
    category: 'Материнские платы',
    manufacturer: 'ASUS',
    specs: ['LGA 1700 • DDR5 • ATX • WiFi 6'],
    price: 32990,
    image: placeholder,
    slug: 'mobo-asus-tuf-z790',
  },
  {
    id: 24,
    name: 'ASRock B650M Pro RS',
    category: 'Материнские платы',
    manufacturer: 'ASRock',
    specs: ['AM5 • DDR5 • mATX'],
    price: 16990,
    image: placeholder,
    slug: 'mobo-asrock-b650m-pro',
  },
]

export function filterProducts(query: string): Product[] {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  return mockProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.manufacturer.toLowerCase().includes(q) ||
      p.specs.some((s) => s.toLowerCase().includes(q))
  )
}
