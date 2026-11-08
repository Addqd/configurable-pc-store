import { type BuilderSelections, estimateComponentPower } from '../stores/builderStore'

export interface BuildSpec { label: string; value: string }

function found(specs: string[], expression: RegExp): string | null {
  return specs.find((part) => expression.test(part)) ?? null
}

/** Specifications are *only* derived from available product fields. */
export function deriveBuilderSpecs(selections: BuilderSelections): BuildSpec[] {
  const specs: BuildSpec[] = []
  const add = (label: string, value: string | null | undefined) => { if (value) specs.push({ label, value }) }
  const cpu = selections.cpu
  const mobo = selections.mobo
  const ram = selections.ram
  const gpu = selections.gpu
  const storage = selections.storage
  const psu = selections.psu
  const chassis = selections.case
  const cooling = selections.cooling

  if (cpu) {
    add('Сокет процессора', found(cpu.specs, /\b(?:AM[345]|LGA[\s-]?\d{4})\b/i))
    add('Частота процессора', found(cpu.specs, /\d[.,]\d+\s*ГГц/i))
    add('Ядра процессора', found(cpu.specs, /\d+\s*(?:ядер|ядра|ядро)/i))
  }
  if (mobo) {
    add('Чипсет материнской платы', mobo.name.match(/\b(?:B650E?|B760|Z790|Z870|B850|X670E?|X870E?)\b/i)?.[0])
    add('Форм-фактор платы', found(mobo.specs, /^(?:ATX|mATX|micro-ATX|mini-ITX|ITX)$/i))
  }
  if (ram) {
    add('Объём оперативной памяти', ram.name.match(/\b\d+\s*ГБ(?![A-Za-zА-Яа-я0-9])/i)?.[0])
    add('Частота памяти', found(ram.specs, /\d+\s*МГц/i))
    add('Тип памяти', [ram.type, ram.name, ...ram.specs].join(' ').match(/\bDDR[345]\b/i)?.[0])
  }
  if (storage) {
    add('Объём накопителя', storage.name.match(/\b\d+(?:[.,]\d+)?\s*(?:ТБ|ГБ)(?![A-Za-zА-Яа-я0-9])/i)?.[0])
    add('Интерфейс накопителя', found(storage.specs, /\b(?:PCIe|M\.2|NVMe|SATA)\b/i) ??
      ([storage.type, storage.name].join(' ').match(/\b(?:NVMe|SATA|M\.2)\b/i)?.[0] ?? null))
  }
  if (gpu) {
    add('Графический процессор', gpu.name)
    add('Объём видеопамяти', found(gpu.specs, /\d+\s*ГБ\s*GDDR/i))
  }
  if (psu) {
    add('Мощность блока питания', found(psu.specs, /\d+\s*(?:Вт|W)(?![A-Za-zА-Яа-я0-9])/i) ??
      psu.name.match(/\b\d+\s*(?:Вт|W)(?![A-Za-zА-Яа-я0-9])/i)?.[0])
    add('Эффективность БП', found(psu.specs, /80\+\s*(?:Gold|Silver|Bronze|Platinum|Titanium)/i))
  }
  const power = estimateComponentPower(selections)
  if (power !== null) add('Потребление CPU + GPU (минимум)', `≥ ${power} Вт`)
  if (chassis) add('Форм-фактор корпуса', found(chassis.specs, /^(?:ATX|mATX|micro-ATX|mini-ITX|ITX)$/i) ?? chassis.type)
  if (cooling) add('Тип охлаждения', found(cooling.specs, /^(?:Воздушное|СЖО)$/i) ?? cooling.type)
  return specs
}

