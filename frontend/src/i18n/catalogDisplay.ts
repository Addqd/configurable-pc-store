import i18n from './index'

/** Localize existing demo-catalog descriptions at render time only.
 * Never mutate product.category, product.specs, cart snapshots, or saved builds.
 */
const catalogNames: Record<string, string> = {
  'Готовые сборки': 'Prebuilt PCs', 'Видеокарты': 'Graphics cards',
  'Процессоры': 'Processors', 'Материнские платы': 'Motherboards',
  'Оперативная память': 'Memory', 'Накопители': 'Storage',
  'Блоки питания': 'Power supplies', 'Корпуса': 'Cases',
  'Охлаждение': 'Cooling', 'Периферия': 'Peripherals',
  'Мониторы': 'Monitors', 'Аксессуары': 'Accessories',
  'Сетевое оборудование': 'Networking', 'Софт и сервисы': 'Software & services',
  'Игровые ПК': 'Gaming PCs', 'Рабочие станции': 'Workstations',
  'Мини-ПК': 'Mini PCs', 'Игровая': 'Gaming',
  'Чёрный': 'Black', 'Белый': 'White', 'Серый': 'Gray',
  'Серебристый': 'Silver', 'Воздушное': 'Air cooling', 'СЖО': 'Liquid cooling',
  'Процессор': 'Processor', 'Материнская плата': 'Motherboard',
  'Видеокарта': 'Graphics card', 'Накопитель': 'Storage',
  'Блок питания': 'Power supply', 'Корпус': 'Case',
  'Тип охлаждения': 'Cooling type',
  'Сокет процессора': 'CPU socket', 'Частота процессора': 'CPU frequency',
  'Ядра процессора': 'CPU cores', 'Чипсет материнской платы': 'Motherboard chipset',
  'Форм-фактор платы': 'Motherboard form factor', 'Объём оперативной памяти': 'RAM capacity',
  'Частота памяти': 'Memory frequency', 'Тип памяти': 'Memory type',
  'Объём накопителя': 'Storage capacity', 'Интерфейс накопителя': 'Storage interface',
  'Графический процессор': 'Graphics processor', 'Объём видеопамяти': 'Video memory capacity',
  'Мощность блока питания': 'Power supply wattage', 'Эффективность БП': 'PSU efficiency',
  'Потребление CPU + GPU (минимум)': 'CPU + GPU power draw (minimum)',
  'Форм-фактор корпуса': 'Case form factor', 'Производитель': 'Manufacturer',
  'Разработчик графического процессора': 'GPU chip manufacturer',
  'Тип видеопамяти': 'Video memory type', 'Разрядность шины памяти': 'Memory bus width',
  'Частота (согласно демо-данным)': 'Frequency (demo data)',
  'Технология масштабирования': 'Upscaling technology',
  'Количество ядер': 'Core count', 'Количество потоков': 'Thread count',
  'Максимальная частота': 'Maximum frequency', 'Сокет': 'Socket',
  'Чипсет': 'Chipset', 'Форм-фактор': 'Form factor',
  'Интерфейс расширения': 'Expansion interface',
  'Сокет CPU и платы': 'CPU/motherboard socket',
  'Совместимость охлаждения': 'Cooler compatibility',
  'Тип оперативной памяти': 'Memory type',
  'Форм-фактор корпуса и платы': 'Case/motherboard form factor',
  'Габариты видеокарты': 'GPU dimensions',
  'В каталоге нет данных о сокете': 'Socket data is unavailable',
  'В каталоге нет данных о типе памяти': 'Memory type data is unavailable',
  'Не указан форм-фактор': 'Form factor is unavailable',
  'Точный список сокетов кулера неизвестен': 'Supported cooler sockets are unknown',
  'Нет сопоставимых данных о длине GPU и допустимой длине в корпусе': 'Comparable GPU and case clearance data is unavailable',
  'Недостаточно данных о потреблении CPU/GPU или мощности БП': 'Insufficient CPU/GPU draw or PSU wattage data',
  'Нужен список поддерживаемых форм-факторов корпуса': 'Case-supported form factors must be confirmed',
}
const replacements: ReadonlyArray<[RegExp, string]> = [
  [/\b(\d+(?:[.,]\d+)?)\s*ГБ(?![А-Яа-яA-Za-z0-9])/g, '$1 GB'],
  [/\b(\d+(?:[.,]\d+)?)\s*ТБ(?![А-Яа-яA-Za-z0-9])/g, '$1 TB'],
  [/\b(\d+(?:[.,]\d+)?)\s*МГц(?![А-Яа-яA-Za-z0-9])/g, '$1 MHz'],
  [/\b(\d+(?:[.,]\d+)?)\s*ГГц(?![А-Яа-яA-Za-z0-9])/g, '$1 GHz'],
  [/\b(\d+(?:[.,]\d+)?)\s*Вт(?![А-Яа-яA-Za-z0-9])/g, '$1 W'],
  [/\b(\d+)\s*бит(?![А-Яа-яA-Za-z0-9])/g, '$1-bit'],
  [/\b(\d+)\s*(?:ядер|ядра|ядро)(?![А-Яа-яA-Za-z0-9])/g, '$1 cores'],
  [/\b(\d+)\s*(?:потоков|потока|поток)(?![А-Яа-яA-Za-z0-9])/g, '$1 threads'],
  [/^Игровой ПК/g, 'Gaming PC'],
  [/^Стриминговый ПК/g, 'Streaming PC'],
  [/^Рабочая станция/g, 'Workstation'],
  [/^Компактный ПК/g, 'Compact PC'],
]
export function catalogDisplay(value: string, language = i18n.resolvedLanguage): string {
  if (language !== 'en') return value
  let out = catalogNames[value] ?? value
  for (const [pattern, replacement] of replacements) out = out.replace(pattern, replacement)
  return out
}

const demoReviewsEN: Record<string, string> = {
  'Демонстрационный отзыв: карточка видеокарты удобна для сравнения характеристик.': 'Demo review: the graphics card page makes it easy to compare specifications.',
  'Демонстрационный отзыв: хотелось бы больше фотографий товара.': 'Demo review: more product photos would be helpful.',
  'Демонстрационный отзыв: описание помогло ознакомиться с параметрами.': 'Demo review: the description helped me understand the specifications.',
  'Демонстрационный отзыв: основные параметры процессора видны сразу.': 'Demo review: key processor specs are immediately visible.',
  'Демонстрационный отзыв: удобно смотреть сокет и количество ядер.': 'Demo review: easy to check the socket and core count.',
  'Демонстрационный отзыв: удобно проверять форм-фактор и тип памяти.': 'Demo review: convenient form-factor and memory-type details.',
  'Демонстрационный отзыв: информация о разъёмах пригодилась бы подробнее.': 'Demo review: more detailed connectivity information would be useful.',
  'Демонстрационный отзыв: состав сборки показан понятно.': 'Demo review: the build components are clearly presented.',
  'Демонстрационный отзыв: удобно видеть основные комплектующие.': 'Demo review: key components are easy to see.',
}
export function demoReviewDisplay(text: string): string {
  return i18n.resolvedLanguage === 'en' ? (demoReviewsEN[text] ?? text) : text
}
