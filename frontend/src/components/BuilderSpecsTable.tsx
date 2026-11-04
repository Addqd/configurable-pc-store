import { useMemo, useState } from 'react'
import { useBuilderStore, type BuilderSelections, estimateComponentPower } from '../stores/builderStore'
import { FiChevronUp, FiChevronDown } from 'react-icons/fi'

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

export function BuilderSpecsTable() {
  const [isOpen, setIsOpen] = useState(true)
  const selections = useBuilderStore((state) => state.selections)
  const specs = useMemo(() => deriveBuilderSpecs(selections), [selections])
  const left = specs.slice(0, Math.ceil(specs.length / 2))
  const right = specs.slice(Math.ceil(specs.length / 2))

  const renderColumn = (items: BuildSpec[]) => (
    <div className="min-w-0 space-y-2">
      {items.map(({ label, value }) => (
        <div key={label} className="flex min-w-0 items-baseline gap-2 text-xs sm:text-sm">
          <span className="shrink-0 text-text-muted">{label}</span>
          <span className="min-w-2 flex-1 border-b border-dotted border-border" aria-hidden="true" />
          <span className="max-w-[55%] break-words text-right font-medium text-text-primary">{value}</span>
        </div>
      ))}
    </div>
  )

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <button type="button" onClick={() => setIsOpen((value) => !value)} aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold text-text-primary transition-colors hover:bg-surface-3">
        Характеристики сборки
        {isOpen ? <FiChevronUp className="h-4 w-4 shrink-0" /> : <FiChevronDown className="h-4 w-4 shrink-0" />}
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          {specs.length === 0 ? (
            <p className="text-sm text-text-muted">Выберите комплектующие, чтобы увидеть их характеристики.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-5">
              {renderColumn(left)}
              {renderColumn(right)}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
