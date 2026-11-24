import i18n from './index'

/**
 * Locale-aware presentation of product characteristics.
 *
 * The PostgreSQL rows keep the Russian definition labels, units and categorical
 * values produced by the normalized seed migration; nothing here is ever written
 * back. Presentation is derived from the structured API fields (`code`, `name`,
 * `data_type`, `unit`, `value`, `display_value`) so the English view never parses
 * or rewrites a Russian display string:
 *
 * - Russian mode reuses the server-rendered `display_value` verbatim, which keeps
 *   today's wording, units and number formatting exactly as before;
 * - English mode formats the native JSON `value` with the translated label, unit
 *   and the known categorical values;
 * - an unknown definition or value falls back to the stored Russian text instead
 *   of inventing a translation.
 */

/** A row from either the server contract or the front-end adapter. */
export interface CharacteristicLike {
  code: string
  name: string
  /** Server `data_type` or adapter `dataType`. */
  dataType?: string | null
  data_type?: string | null
  unit?: string | null
  value?: unknown
  /** Server `display_value` or adapter `displayValue`. */
  displayValue?: string | null
  display_value?: string | null
}

export interface CharacteristicName {
  code: string
  /** Russian label stored in the database. */
  ru: string
  /** English label used by the storefront and the admin editor. */
  en: string
}

/**
 * Every definition declared by the normalized seed migration.
 *
 * `code` is the stable identifier; the Russian label is what the database stores,
 * so a definition whose label the dictionary does not know simply keeps its
 * Russian text in English mode as well.
 */
const NAMES: readonly CharacteristicName[] = [
  { code: 'accessory_type', ru: 'Тип аксессуара', en: 'Accessory type' },
  { code: 'additional_interface', ru: 'Дополнительный интерфейс', en: 'Additional interface' },
  { code: 'architecture', ru: 'Архитектура', en: 'Architecture' },
  { code: 'available_board_power_connectors', ru: 'Разъёмы питания платы', en: 'Board power connectors' },
  { code: 'available_cpu_power_connectors', ru: 'Разъёмы питания CPU', en: 'CPU power connectors' },
  { code: 'available_gpu_power_connectors', ru: 'Разъёмы питания GPU', en: 'GPU power connectors' },
  { code: 'base_clock_ghz', ru: 'Базовая частота', en: 'Base clock' },
  { code: 'bokovaya_panel', ru: 'Боковая панель', en: 'Side panel' },
  { code: 'boost_clock_mhz', ru: 'Boost-частота', en: 'Boost clock' },
  { code: 'cabling', ru: 'Кабельная система', en: 'Cabling' },
  { code: 'cache_l1_kb', ru: 'Кэш L1', en: 'L1 cache' },
  { code: 'cache_l2_mb', ru: 'Кэш L2', en: 'L2 cache' },
  { code: 'cache_l3_mb', ru: 'Кэш L3', en: 'L3 cache' },
  { code: 'cache_mb', ru: 'Буфер', en: 'Cache buffer' },
  { code: 'cache_smart_mb', ru: 'Кэш Intel Smart Cache', en: 'Intel Smart Cache' },
  { code: 'capacity_gb', ru: 'Объём', en: 'Capacity' },
  { code: 'cas_latency', ru: 'CAS Latency', en: 'CAS latency' },
  { code: 'chipset', ru: 'Чипсет', en: 'Chipset' },
  { code: 'color', ru: 'Цвет', en: 'Color' },
  { code: 'connection', ru: 'Подключение', en: 'Connection' },
  { code: 'connector', ru: 'Особенность 3', en: 'Feature 3' },
  { code: 'cooling_system', ru: 'Система охлаждения', en: 'Cooling system' },
  { code: 'cooling_type', ru: 'Тип охлаждения', en: 'Cooling type' },
  { code: 'cores', ru: 'Количество ядер', en: 'Core count' },
  { code: 'cpu_description', ru: 'Процессор', en: 'Processor' },
  { code: 'cpu_process', ru: 'Техпроцесс', en: 'Process technology' },
  { code: 'cuda_cores', ru: 'Ядер CUDA', en: 'CUDA cores' },
  { code: 'diagonal_inch', ru: 'Диагональ', en: 'Diagonal' },
  { code: 'dimensions_mm', ru: 'Габариты', en: 'Dimensions' },
  { code: 'directx', ru: 'DirectX', en: 'DirectX' },
  { code: 'display_outputs', ru: 'Выходы на монитор', en: 'Display outputs' },
  { code: 'dram_cache_gb', ru: 'Объём DRAM-кэша', en: 'DRAM cache size' },
  { code: 'dram_cache_type', ru: 'Тип DRAM-кэша', en: 'DRAM cache type' },
  { code: 'drive_form_factor', ru: 'Форм-фактор накопителя', en: 'Drive form factor' },
  { code: 'driver_diameter_mm', ru: 'Диаметр излучателей', en: 'Driver diameter' },
  { code: 'ecc_memory', ru: 'ECC память', en: 'ECC memory' },
  { code: 'efficiency_cores', ru: 'E-ядра', en: 'Efficiency cores' },
  { code: 'efficiency_rating', ru: 'Сертификат эффективности', en: 'Efficiency rating' },
  { code: 'expansion_interface', ru: 'Интерфейс расширения', en: 'Expansion interface' },
  { code: 'extreme_clock_mhz', ru: 'Extreme Performance', en: 'Extreme Performance clock' },
  { code: 'fan_count', ru: 'Количество вентиляторов', en: 'Fan count' },
  { code: 'fan_size_mm', ru: 'Диаметр вентилятора', en: 'Fan diameter' },
  { code: 'form_factor', ru: 'Форм-фактор', en: 'Form factor' },
  { code: 'frequency_mhz', ru: 'Частота', en: 'Frequency' },
  { code: 'front_fan_count', ru: 'Фронтальные вентиляторы', en: 'Front fans' },
  { code: 'front_fan_size_mm', ru: 'Размер фронтального вентилятора', en: 'Front fan size' },
  { code: 'front_material', ru: 'Материал передней панели', en: 'Front panel material' },
  { code: 'gpu_description', ru: 'Видеокарта', en: 'Graphics card' },
  { code: 'gpu_interfaces', ru: 'Интерфейсы видеокарт', en: 'Graphics card interfaces' },
  { code: 'gpu_model', ru: 'Графический процессор', en: 'Graphics processor' },
  { code: 'gpu_technology', ru: 'Технология / Boost', en: 'Technology / Boost' },
  { code: 'graphics_chip_brand', ru: 'Бренд графического чипа', en: 'Graphics chip brand' },
  { code: 'has_3d_vcache', ru: '3D V-Cache', en: '3D V-Cache' },
  { code: 'has_integrated_graphics', ru: 'Встроенная графика', en: 'Integrated graphics' },
  { code: 'heatspreader_color', ru: 'Цвет радиатора', en: 'Heatspreader color' },
  { code: 'igrovaya_lineyka', ru: 'Игровая линейка', en: 'Gaming line' },
  { code: 'integrated_gpu_clock_mhz', ru: 'Частота графики', en: 'Graphics clock' },
  { code: 'integrated_gpu_cores', ru: 'Графических ядер', en: 'Graphics cores' },
  { code: 'integrated_graphics', ru: 'Встроенная графика', en: 'Integrated graphics' },
  { code: 'interface', ru: 'Интерфейс', en: 'Interface' },
  { code: 'interface_detail', ru: 'Интерфейс подключения (подробно)', en: 'Connection interface (details)' },
  { code: 'keyboard_layout', ru: 'Формат клавиатуры', en: 'Keyboard layout' },
  { code: 'kodovoe_imya', ru: 'Кодовое имя', en: 'Codename' },
  { code: 'length_mm', ru: 'Длина', en: 'Length' },
  { code: 'lighting', ru: 'Подсветка', en: 'Lighting' },
  { code: 'max_clock_ghz', ru: 'Максимальная частота', en: 'Maximum clock' },
  { code: 'max_memory_gb', ru: 'Максимум памяти', en: 'Maximum memory' },
  { code: 'max_monitors', ru: 'Количество мониторов', en: 'Monitor count' },
  { code: 'max_power_draw_w', ru: 'Потребление', en: 'Power draw' },
  { code: 'max_resolution', ru: 'Макс. разрешение', en: 'Max resolution' },
  { code: 'max_temperature_c', ru: 'Максимальная температура', en: 'Maximum temperature' },
  { code: 'maximum_turbo_power_w', ru: 'Максимальная мощность Turbo', en: 'Maximum turbo power' },
  { code: 'memory_bus_bits', ru: 'Шина видеопамяти', en: 'Memory bus width' },
  { code: 'memory_channels', ru: 'Каналы памяти', en: 'Memory channels' },
  { code: 'memory_speed_gbps', ru: 'Скорость памяти', en: 'Memory speed' },
  { code: 'memory_type', ru: 'Тип оперативной памяти', en: 'Memory type' },
  { code: 'model_id', ru: 'Идентификатор модели', en: 'Model identifier' },
  { code: 'module_count', ru: 'Количество модулей', en: 'Module count' },
  { code: 'module_size_gb', ru: 'Ёмкость модуля', en: 'Module capacity' },
  { code: 'nand_type', ru: 'Тип флеш-памяти', en: 'NAND flash type' },
  { code: 'naznachenie', ru: 'Назначение', en: 'Purpose' },
  { code: 'opengl', ru: 'OpenGL', en: 'OpenGL' },
  { code: 'osobennost_cpu', ru: 'Особенность CPU', en: 'CPU feature' },
  { code: 'panel_type', ru: 'Тип матрицы', en: 'Panel type' },
  { code: 'pcie_version', ru: 'Версия PCI Express', en: 'PCI Express version' },
  { code: 'performance_cores', ru: 'P-ядра', en: 'Performance cores' },
  { code: 'platform', ru: 'Платформа', en: 'Platform' },
  { code: 'pokolenie', ru: 'Поколение', en: 'Generation' },
  { code: 'processor_base_power_w', ru: 'Базовая мощность процессора', en: 'Processor base power' },
  { code: 'psu_standard', ru: 'Стандарт', en: 'Standard' },
  { code: 'radiator_size_mm', ru: 'Размер радиатора', en: 'Radiator size' },
  { code: 'ram_capacity_gb', ru: 'Объём оперативной памяти', en: 'RAM capacity' },
  { code: 'ram_slots', ru: 'Слотов оперативной памяти', en: 'Memory slots' },
  { code: 'read_speed_mb_s', ru: 'Макс. скорость чтения', en: 'Max read speed' },
  { code: 'recommended_psu_w', ru: 'Рекомендуемая мощность БП', en: 'Recommended PSU wattage' },
  { code: 'refresh_rate_hz', ru: 'Частота обновления', en: 'Refresh rate' },
  { code: 'required_board_power_connectors', ru: 'Питание материнской платы', en: 'Motherboard power connectors' },
  { code: 'required_cpu_power_connectors', ru: 'Питание процессора', en: 'CPU power connectors' },
  { code: 'required_power_connectors', ru: 'Требуемые разъёмы питания GPU', en: 'Required GPU power connectors' },
  { code: 'resolution', ru: 'Разрешение', en: 'Resolution' },
  { code: 'response_time_ms', ru: 'Время отклика', en: 'Response time' },
  { code: 'rpm', ru: 'Скорость вращения', en: 'Spindle speed' },
  { code: 'sensor', ru: 'Особенность 3', en: 'Feature 3' },
  { code: 'sensor_dpi', ru: 'Разрешение сенсора (макс.)', en: 'Max sensor resolution' },
  { code: 'series', ru: 'Серия', en: 'Series' },
  { code: 'socket', ru: 'Сокет', en: 'Socket' },
  { code: 'storage_capacity_gb', ru: 'Объём накопителя', en: 'Storage capacity' },
  { code: 'storage_interfaces', ru: 'Интерфейсы накопителей', en: 'Storage interfaces' },
  { code: 'storage_type', ru: 'Тип накопителя', en: 'Storage type' },
  { code: 'supported_motherboard_form_factors', ru: 'Совместимые форм-факторы материнских плат', en: 'Supported motherboard form factors' },
  { code: 'supported_nvme_lengths_mm', ru: 'Поддерживаемые длины NVMe', en: 'Supported NVMe lengths' },
  { code: 'supported_psu_form_factors', ru: 'Совместимые форм-факторы блоков питания', en: 'Supported PSU form factors' },
  { code: 'supported_ram_speed_mhz', ru: 'Поддерживаемая частота памяти', en: 'Supported memory speed' },
  { code: 'supported_sockets', ru: 'Совместимые сокеты', en: 'Supported sockets' },
  { code: 'surround_format', ru: 'Формат звука', en: 'Sound format' },
  { code: 'switch_mechanism', ru: 'Механизм переключателей', en: 'Switch mechanism' },
  { code: 'switch_model', ru: 'Модель переключателей', en: 'Switch model' },
  { code: 'thermal_design_power_w', ru: 'Теплопакет (TDP)', en: 'Thermal design power (TDP)' },
  { code: 'thickness_slots', ru: 'thickness_slots', en: 'Slot thickness' },
  { code: 'threads', ru: 'Количество потоков', en: 'Thread count' },
  { code: 'unlocked_multiplier', ru: 'Разблокированный множитель', en: 'Unlocked multiplier' },
  { code: 'upholstery_material', ru: 'Материал обивки', en: 'Upholstery material' },
  { code: 'vram_gb', ru: 'Объём видеопамяти', en: 'Video memory capacity' },
  { code: 'vram_type', ru: 'Тип видеопамяти', en: 'Video memory type' },
  { code: 'wattage_w', ru: 'Мощность', en: 'Wattage' },
  { code: 'weight_g', ru: 'Масса', en: 'Weight' },
  { code: 'wireless', ru: 'Беспроводная связь', en: 'Wireless' },
  { code: 'write_speed_mb_s', ru: 'Макс. скорость записи', en: 'Max write speed' },
  { code: 'zvuchanie', ru: 'Звучание', en: 'Sound character' },
]

/**
 * Aggregated labels the builder summary shows that are not stored as
 * characteristic names of their own. Kept next to the definitions so every
 * characteristic label resolves through one dictionary.
 */
const DERIVED_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['Сокет процессора', 'CPU socket'],
  ['Частота процессора', 'CPU frequency'],
  ['Ядра процессора', 'CPU cores'],
  ['Чипсет материнской платы', 'Motherboard chipset'],
  ['Форм-фактор платы', 'Motherboard form factor'],
  ['Частота памяти', 'Memory frequency'],
  ['Интерфейс накопителя', 'Storage interface'],
  ['Эффективность БП', 'PSU efficiency'],
  ['Потребление CPU + GPU (минимум)', 'CPU + GPU power draw (minimum)'],
  ['Форм-фактор корпуса', 'Case form factor'],
  ['Тип памяти', 'Memory type'],
  ['Тип охлаждения', 'Cooling type'],
  ['Готовые сборки', 'Prebuilt PCs'],
]

/** Stored units and their English equivalents. */
const UNITS: Readonly<Record<string, string>> = {
  'ГБ': 'GB',
  'ТБ': 'TB',
  'МБ': 'MB',
  'КБ': 'KB',
  'ГГц': 'GHz',
  'МГц': 'MHz',
  'Гц': 'Hz',
  'Вт': 'W',
  'мм': 'mm',
  'мс': 'ms',
  'шт.': 'pcs',
  'бит': 'bit',
  'г': 'g',
  'слот': 'slots',
  'дюйм': 'in',
  'об/мин': 'RPM',
  'Гбит/с': 'Gbps',
  'МБ/с': 'MB/s',
  '°C': '°C',
  'DPI': 'DPI',
}

/**
 * Known categorical values stored in Russian.
 *
 * Only technical wording is translated: model names, manufacturers, sockets,
 * connector identifiers and other technical identifiers stay untouched, so an
 * unknown value is always shown exactly as stored.
 */
const VALUES: Readonly<Record<string, string>> = {
  'Чёрный': 'Black',
  'Белый': 'White',
  'Серебристый': 'Silver',
  'Серый': 'Gray',
  'Воздушное': 'Air cooling',
  'СЖО': 'Liquid cooling',
  'Закалённое стекло': 'Tempered glass',
  'Деревянные элементы': 'Wooden elements',
  'Механическая': 'Mechanical',
  'Модульная': 'Modular',
  'Проводное': 'Wired',
  'Искусственная кожа': 'Faux leather',
  'Игровое кресло': 'Gaming chair',
  'кабель питания': 'power cable',
  'TSMC 5 нм': 'TSMC 5 nm',
  'TKL, без цифрового блока': 'TKL, without numeric keypad',
  'Виртуальное 7.1 (по исходной записи)': 'Virtual 7.1 (per source record)',
  'Декоративный удлинитель питания ATX 24-pin': 'Decorative ATX 24-pin power extension cable',
  'Twin Edge (по каталогу)': 'Twin Edge (per catalog)',
}

const nameByCode = new Map(NAMES.map((entry) => [entry.code, entry]))
const englishByRussianName = new Map<string, string>([
  ...NAMES.map((entry) => [entry.ru, entry.en] as [string, string]),
  ...DERIVED_LABELS.map(([ru, en]) => [ru, en] as [string, string]),
])

/** Boolean wording, kept identical to the server's Russian rendering. */
const BOOLEAN_LABELS = {
  ru: { true: 'Да', false: 'Нет' },
  en: { true: 'Yes', false: 'No' },
} as const

function currentLanguage(): string {
  return i18n.resolvedLanguage ?? i18n.language ?? 'ru'
}

function isEnglish(language: string): boolean {
  return language.startsWith('en')
}

function dataTypeOf(row: CharacteristicLike): string {
  return row.dataType ?? row.data_type ?? 'string'
}

function displayValueOf(row: CharacteristicLike): string {
  return (row.displayValue ?? row.display_value ?? '').trim()
}

/** Deterministic decimal rendering that never switches to exponent notation. */
export function formatCharacteristicNumber(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Number.isInteger(value)) return String(value)
  const rounded = Number(value.toFixed(10))
  return String(rounded)
}

export function translateCharacteristicUnit(
  unit: string | null | undefined,
  language = currentLanguage(),
): string {
  if (!unit) return ''
  return isEnglish(language) ? (UNITS[unit] ?? unit) : unit
}

/** English text of a stored Russian label, or the label itself when unknown. */
export function translateCharacteristicLabel(
  label: string,
  language = currentLanguage(),
): string {
  const trimmed = label.trim()
  if (!isEnglish(language) || !trimmed) return label
  return englishByRussianName.get(trimmed) ?? label
}

/** English text of a stored categorical value, or the value itself when unknown. */
export function translateCharacteristicCategoricalValue(
  value: string,
  language = currentLanguage(),
): string {
  if (!isEnglish(language)) return value
  return VALUES[value] ?? value
}

/**
 * Localized label of one characteristic definition.
 *
 * The stable `code` is authoritative; the stored Russian `name` is the fallback
 * for definitions the dictionary does not know yet.
 */
export function characteristicLabel(
  row: CharacteristicLike,
  language = currentLanguage(),
): string {
  if (!isEnglish(language)) return row.name
  return nameByCode.get(row.code)?.en ?? englishByRussianName.get(row.name.trim()) ?? row.name
}

/** Localized, ready-to-render value of one characteristic. */
export function characteristicValue(
  row: CharacteristicLike,
  language = currentLanguage(),
): string {
  if (!isEnglish(language)) {
    // Russian keeps the server-rendered string, unit appended once.
    const display = displayValueOf(row)
    if (display) return display
    return formatFromStructuredValue(row, language)
  }
  const formatted = formatFromStructuredValue(row, language)
  // An unknown/unhandled shape falls back to the stored rendering rather than
  // showing an empty cell.
  return formatted || displayValueOf(row)
}

/** Formats the native JSON value with a translated unit. */
function formatFromStructuredValue(row: CharacteristicLike, language: string): string {
  const raw = row.value
  let text: string
  switch (dataTypeOf(row)) {
    case 'boolean':
      // Only a real boolean is rendered; anything else is not turned into `false`.
      if (raw !== true && raw !== false) return ''
      text = BOOLEAN_LABELS[isEnglish(language) ? 'en' : 'ru'][raw ? 'true' : 'false']
      break
    case 'number':
      text = typeof raw === 'number' ? formatCharacteristicNumber(raw) : ''
      break
    case 'string_list':
      text = Array.isArray(raw)
        ? raw.map((item) => (typeof item === 'string' ? translateCharacteristicCategoricalValue(item, language) : '')).join(', ')
        : ''
      break
    case 'number_list':
      text = Array.isArray(raw)
        ? raw.map((item) => (typeof item === 'number' ? formatCharacteristicNumber(item) : '')).join(', ')
        : ''
      break
    default:
      text = typeof raw === 'string' ? translateCharacteristicCategoricalValue(raw, language) : ''
  }
  const unit = translateCharacteristicUnit(row.unit, language)
  return text && unit ? `${text} ${unit}` : text
}

/**
 * Short display lines of a product, e.g. for a catalog card or a cart line.
 *
 * Structured rows win because they carry units and native types; the provided
 * strings are only a fallback for data that has no structured counterpart (demo
 * fixtures and older persisted cart entries).
 */
export function characteristicLines(
  rows: readonly CharacteristicLike[] | undefined,
  fallback: readonly string[] = [],
  { limit, language = currentLanguage() }: { limit?: number; language?: string } = {},
): string[] {
  const fromRows = (rows ?? [])
    .map((row) => characteristicValue(row, language))
    .filter((value) => value.trim().length > 0)
  const lines = fromRows.length > 0 ? fromRows : [...fallback]
  return typeof limit === 'number' ? lines.slice(0, limit) : lines
}

/** Definition/display pairs for a specification table. */
export function characteristicPairs(
  rows: readonly CharacteristicLike[] | undefined,
  language = currentLanguage(),
): Array<{ label: string; value: string }> {
  return (rows ?? []).flatMap((row) => {
    const label = characteristicLabel(row, language).trim()
    const value = characteristicValue(row, language).trim()
    return label && value ? [{ label, value }] : []
  })
}
