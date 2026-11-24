import { getProductsForCategory } from '../test-api'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { emptyBuilderSelections } from '../stores/builderStore'
import { deriveBuilderSpecs } from '../data/builderSpecs'

afterEach(async () => { await i18n.changeLanguage('ru') })

describe('builder specifications', () => {
  it('shows storage capacity and interface from structured characteristics', () => {
    const parts = emptyBuilderSelections()
    parts.storage = getProductsForCategory('storage').find((item) => item.name.includes('Samsung 990 PRO'))!
    const specs = deriveBuilderSpecs(parts)
    expect(specs.find((item) => item.label === 'Объём накопителя')?.value).toContain('ГБ')
    expect(specs.find((item) => item.label === 'Интерфейс накопителя')?.value).toBe('nvme')
  })

  it('reads CPU and motherboard values by characteristic code', () => {
    const parts = emptyBuilderSelections()
    parts.cpu = getProductsForCategory('cpu')[0]
    parts.mobo = getProductsForCategory('mobo')[0]
    const specs = deriveBuilderSpecs(parts)
    expect(specs.find((item) => item.label === 'Сокет процессора')?.value).toBe('am5')
    expect(specs.find((item) => item.label === 'Максимальная частота')).toBeUndefined()
    expect(specs.find((item) => item.label === 'Частота процессора')?.value).toBe('5.1 ГГц')
    expect(specs.find((item) => item.label === 'Ядра процессора')?.value).toBe('6')
    // A motherboard fixture without characteristics contributes no invented rows.
    expect(specs.some((item) => item.label === 'Чипсет материнской платы')).toBe(false)
  })

  it('does not invent a power figure when a component declares none', () => {
    const parts = emptyBuilderSelections()
    parts.cpu = { ...getProductsForCategory('cpu')[0], characteristics: [] }
    parts.gpu = getProductsForCategory('gpu')[0]
    const specs = deriveBuilderSpecs(parts)
    expect(specs.some((item) => item.label === 'Потребление CPU + GPU (минимум)')).toBe(false)
  })

  it('formats every value for the requested language without touching the labels', () => {
    const parts = emptyBuilderSelections()
    parts.cpu = getProductsForCategory('cpu')[0]
    parts.storage = getProductsForCategory('storage').find((item) => item.name.includes('Samsung 990 PRO'))!

    const english = deriveBuilderSpecs(parts, 'en')
    const cpuSocket = english.find((item) => item.label === 'Сокет процессора')
    // Socket identifiers stay untouched in both languages.
    expect(cpuSocket?.value).toBe('am5')
    const capacity = english.find((item) => item.label === 'Объём накопителя')
    expect(capacity?.value).toContain('GB')
    expect(capacity?.value).not.toContain('ГБ')
    const storageInterface = english.find((item) => item.label === 'Интерфейс накопителя')
    expect(storageInterface?.value).toBe('nvme')

    const russian = deriveBuilderSpecs(parts, 'ru')
    expect(russian.find((item) => item.label === 'Объём накопителя')?.value).toContain('ГБ')
    // Labels are stable keys; the summary localizes them itself.
    expect(english.map((item) => item.label)).toEqual(russian.map((item) => item.label))
  })
})
