import { afterEach, describe, expect, it } from 'vitest'
import i18n from './index'
import {
  characteristicLabel,
  characteristicLines,
  characteristicPairs,
  characteristicValue,
  formatCharacteristicNumber,
  translateCharacteristicCategoricalValue,
  translateCharacteristicLabel,
  translateCharacteristicUnit,
  type CharacteristicLike,
} from './characteristics'

/** One API-shaped row. */
const row = (overrides: Partial<CharacteristicLike>): CharacteristicLike => ({
  code: 'cores', name: 'Количество ядер', data_type: 'number', unit: null,
  value: 8, display_value: '8', ...overrides,
})

afterEach(async () => { await i18n.changeLanguage('ru') })

describe('characteristic localization', () => {
  it('keeps the existing Russian labels and server formatting', () => {
    const memory = row({
      code: 'vram_gb', name: 'Объём видеопамяти', unit: 'ГБ',
      value: 12, display_value: '12 ГБ',
    })
    expect(characteristicLabel(memory, 'ru')).toBe('Объём видеопамяти')
    // RU mode reuses the server string verbatim, including units and separators.
    expect(characteristicValue(memory, 'ru')).toBe('12 ГБ')
    expect(characteristicValue(row({ code: 'color', name: 'Цвет', data_type: 'string', value: 'Чёрный', display_value: 'Чёрный' }), 'ru'))
      .toBe('Чёрный')
    expect(characteristicValue(row({ code: 'has_3d_vcache', name: '3D V-Cache', data_type: 'boolean', value: false, display_value: 'Нет' }), 'ru'))
      .toBe('Нет')
  })

  it('translates labels, units, numbers and booleans for English', () => {
    expect(characteristicLabel(row({}), 'en')).toBe('Core count')
    expect(characteristicValue(row({ code: 'vram_gb', name: 'Объём видеопамяти', unit: 'ГБ', value: 12, display_value: '12 ГБ' }), 'en'))
      .toBe('12 GB')
    expect(characteristicValue(row({ code: 'thermal_design_power_w', name: 'Теплопакет (TDP)', unit: 'Вт', value: 105, display_value: '105 Вт' }), 'en'))
      .toBe('105 W')
    expect(characteristicValue(row({ code: 'boost_clock_mhz', name: 'Boost-частота', unit: 'МГц', value: 2475, display_value: '2475 МГц' }), 'en'))
      .toBe('2475 MHz')
    expect(characteristicValue(row({ code: 'length_mm', name: 'Длина', unit: 'мм', value: 269.1, display_value: '269.1 мм' }), 'en'))
      .toBe('269.1 mm')
    expect(characteristicValue(row({ code: 'has_integrated_graphics', name: 'Встроенная графика', data_type: 'boolean', value: true, display_value: 'Да' }), 'en'))
      .toBe('Yes')
    expect(characteristicValue(row({ code: 'has_integrated_graphics', name: 'Встроенная графика', data_type: 'boolean', value: false, display_value: 'Нет' }), 'en'))
      .toBe('No')
    // A zero value is a real value, never an absence.
    expect(characteristicValue(row({ value: 0, display_value: '0' }), 'en')).toBe('0')
  })

  it('formats list values from the structured array and appends the unit once', () => {
    const connectors = row({
      code: 'required_power_connectors', name: 'Требуемые разъёмы питания GPU',
      data_type: 'string_list', unit: null, value: ['pcie-8pin', 'pcie-8pin'],
      display_value: 'pcie-8pin, pcie-8pin',
    })
    expect(characteristicValue(connectors, 'en')).toBe('pcie-8pin, pcie-8pin')

    const dimensions = row({
      code: 'dimensions_mm', name: 'Габариты', data_type: 'number_list', unit: 'мм',
      value: [307, 125, 46], display_value: '307, 125, 46 мм',
    })
    expect(characteristicValue(dimensions, 'en')).toBe('307, 125, 46 mm')
    expect(characteristicValue(dimensions, 'ru')).toBe('307, 125, 46 мм')

    const sockets = row({
      code: 'supported_sockets', name: 'Совместимые сокеты', data_type: 'string_list',
      unit: null, value: ['am4', 'am5', 'lga1700'], display_value: 'am4, am5, lga1700',
    })
    // Socket identifiers are technical values: they are never rewritten.
    expect(characteristicLabel(sockets, 'en')).toBe('Supported sockets')
    expect(characteristicValue(sockets, 'en')).toBe('am4, am5, lga1700')
  })

  it('translates known categorical values and leaves identifiers untouched', () => {
    expect(translateCharacteristicCategoricalValue('Чёрный', 'en')).toBe('Black')
    expect(translateCharacteristicCategoricalValue('Серебристый', 'en')).toBe('Silver')
    expect(translateCharacteristicCategoricalValue('Искусственная кожа', 'en')).toBe('Faux leather')
    expect(translateCharacteristicCategoricalValue('Модульная', 'en')).toBe('Modular')
    expect(translateCharacteristicCategoricalValue('GDDR6X', 'en')).toBe('GDDR6X')
    expect(translateCharacteristicCategoricalValue('am5', 'en')).toBe('am5')
    expect(translateCharacteristicCategoricalValue('amd', 'en')).toBe('amd')
    expect(translateCharacteristicCategoricalValue('NVIDIA GeForce RTX 4070', 'en'))
      .toBe('NVIDIA GeForce RTX 4070')
    // Russian mode never rewrites a stored value.
    expect(translateCharacteristicCategoricalValue('Чёрный', 'ru')).toBe('Чёрный')
  })

  it('falls back safely for characteristics and values it does not know', () => {
    const future = row({
      code: 'future_probe_code', name: 'Будущая характеристика', data_type: 'string',
      unit: null, value: 'Значение без перевода', display_value: 'Значение без перевода',
    })
    expect(characteristicLabel(future, 'en')).toBe('Будущая характеристика')
    expect(characteristicValue(future, 'en')).toBe('Значение без перевода')

    // A definition may still carry only the display string.
    const legacy = { code: 'legacy_probe', name: 'Старая', data_type: 'number', display_value: '5 Вт' }
    expect(characteristicValue(legacy, 'en')).toBe('5 Вт')
    expect(characteristicValue(legacy, 'ru')).toBe('5 Вт')

    // An unknown unit is kept as stored rather than invented.
    expect(translateCharacteristicUnit('фунт', 'en')).toBe('фунт')
    expect(translateCharacteristicUnit('ГБ', 'en')).toBe('GB')
    expect(translateCharacteristicUnit('ГБ', 'ru')).toBe('ГБ')
  })

  it('never fabricates a boolean that is not stored as one', () => {
    const notBoolean = row({ code: 'flag', name: 'Флаг', data_type: 'boolean', value: 'maybe', display_value: 'может быть' })
    expect(characteristicValue(notBoolean, 'en')).toBe('может быть')
  })

  it('formats numbers without scientific notation', () => {
    expect(formatCharacteristicNumber(12)).toBe('12')
    expect(formatCharacteristicNumber(12.5)).toBe('12.5')
    expect(formatCharacteristicNumber(0)).toBe('0')
    expect(formatCharacteristicNumber(-2.5)).toBe('-2.5')
    expect(formatCharacteristicNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatCharacteristicNumber(Number.NaN)).toBe('')
  })

  it('resolves aggregated builder labels through the same dictionary', () => {
    expect(translateCharacteristicLabel('Сокет процессора', 'en')).toBe('CPU socket')
    expect(translateCharacteristicLabel('Потребление CPU + GPU (минимум)', 'en'))
      .toBe('CPU + GPU power draw (minimum)')
    expect(translateCharacteristicLabel('Сокет процессора', 'ru')).toBe('Сокет процессора')
    expect(translateCharacteristicLabel('Неизвестный ярлык', 'en')).toBe('Неизвестный ярлык')
  })

  it('builds short lines and specification pairs with an explicit fallback', () => {
    const rows = [
      row({ code: 'vram_gb', name: 'Объём видеопамяти', unit: 'ГБ', value: 12, display_value: '12 ГБ' }),
      row({ code: 'vram_type', name: 'Тип видеопамяти', data_type: 'string', value: 'GDDR6X', display_value: 'GDDR6X' }),
    ]
    expect(characteristicLines(rows, ['12 ГБ', 'GDDR6X'], { language: 'en' })).toEqual(['12 GB', 'GDDR6X'])
    expect(characteristicLines(rows, [], { limit: 1, language: 'en' })).toEqual(['12 GB'])
    // No structured rows: the prepared lines are used, as for demo fixtures.
    expect(characteristicLines(undefined, ['12 ГБ'], { language: 'ru' })).toEqual(['12 ГБ'])
    expect(characteristicLines([], ['12 ГБ'], { language: 'en' })).toEqual(['12 ГБ'])
    expect(characteristicPairs(rows, 'en')).toEqual([
      { label: 'Video memory capacity', value: '12 GB' },
      { label: 'Video memory type', value: 'GDDR6X' },
    ])
  })

  it('uses the active i18n language when none is passed', async () => {
    const memory = row({ code: 'vram_gb', name: 'Объём видеопамяти', unit: 'ГБ', value: 12, display_value: '12 ГБ' })
    expect(characteristicLabel(memory)).toBe('Объём видеопамяти')
    await i18n.changeLanguage('en')
    expect(characteristicLabel(memory)).toBe('Video memory capacity')
    expect(characteristicValue(memory)).toBe('12 GB')
  })
})
