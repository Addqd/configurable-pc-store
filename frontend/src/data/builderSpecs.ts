import { type BuilderSelections, estimateComponentPower } from '../stores/builderStore'
import { characteristicOf } from './product'
import { characteristicValue } from '../i18n/characteristics'

export interface BuildSpec { label: string; value: string }

/**
 * Builder summary rows.
 *
 * Every technical value is read from the product's structured characteristics by
 * its stable `code` — never inferred from display strings, file names or product
 * names. A value the catalog does not declare is simply not shown. Values are
 * formatted for `language`, while the labels stay Russian keys that the summary
 * localizes with the shared characteristic dictionary.
 */
export function deriveBuilderSpecs(
  selections: BuilderSelections,
  language = 'ru',
): BuildSpec[] {
  const specs: BuildSpec[] = []
  const add = (label: string, value: string | null | undefined) => { if (value) specs.push({ label, value }) }
  // Structured value of one characteristic, formatted for the active language.
  const text = (product: BuilderSelections[keyof BuilderSelections], code: string) => {
    const row = characteristicOf(product, code)
    return row ? characteristicValue(row, language) || null : null
  }
  const first = (product: BuilderSelections[keyof BuilderSelections], ...codes: string[]) => {
    for (const code of codes) {
      const value = text(product, code)
      if (value) return value
    }
    return null
  }

  const cpu = selections.cpu
  const mobo = selections.mobo
  const ram = selections.ram
  const gpu = selections.gpu
  const storage = selections.storage
  const psu = selections.psu
  const chassis = selections.case
  const cooling = selections.cooling

  if (cpu) {
    add('Сокет процессора', text(cpu, 'socket'))
    add('Частота процессора', first(cpu, 'max_clock_ghz', 'base_clock_ghz'))
    add('Ядра процессора', text(cpu, 'cores'))
  }
  if (mobo) {
    add('Чипсет материнской платы', text(mobo, 'chipset'))
    add('Форм-фактор платы', text(mobo, 'form_factor'))
  }
  if (ram) {
    add('Объём оперативной памяти', text(ram, 'capacity_gb'))
    add('Частота памяти', text(ram, 'frequency_mhz'))
    add('Тип памяти', text(ram, 'memory_type'))
  }
  if (storage) {
    add('Объём накопителя', text(storage, 'capacity_gb'))
    add('Интерфейс накопителя', first(storage, 'interface', 'interface_detail'))
  }
  if (gpu) {
    add('Графический процессор', text(gpu, 'gpu_model') ?? gpu.name)
    const memory = [text(gpu, 'vram_gb'), text(gpu, 'vram_type')].filter(Boolean).join(' ')
    add('Объём видеопамяти', memory || null)
  }
  if (psu) {
    add('Мощность блока питания', text(psu, 'wattage_w'))
    add('Эффективность БП', text(psu, 'efficiency_rating'))
  }
  const power = estimateComponentPower(selections)
  if (power !== null) {
    add('Потребление CPU + GPU (минимум)', `≥ ${power} ${language.startsWith('en') ? 'W' : 'Вт'}`)
  }
  if (chassis) add('Форм-фактор корпуса', text(chassis, 'form_factor'))
  if (cooling) add('Тип охлаждения', text(cooling, 'cooling_type'))
  return specs
}
