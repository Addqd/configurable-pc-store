import { useState } from 'react'
import { useBuilderStore, BUILDER_CATEGORIES, CATALOG_CATEGORY_MAP, CATEGORY_LABELS } from '../stores/builderStore'
import { FiChevronUp, FiChevronDown } from 'react-icons/fi'

/**
 * Build characteristics table — collapsible key/value spec display.
 * Derives values from the current selection.
 */
export function BuilderSpecsTable() {
  const [isOpen, setIsOpen] = useState(true)
  const selections = useBuilderStore((s) => s.selections)

  const specs: { label: string; value: string }[] = []

  // Derive specs from selected products
  if (selections.cpu) {
    const socket = selections.cpu.specs.find((s) => /AM\d|LGA\s*\d+/i.test(s))
    const freq = selections.cpu.specs.find((s) => /ГГц/.test(s))
    const cores = selections.cpu.specs.find((s) => /\d+\s*ядер/.test(s))
    const threads = selections.cpu.specs.find((s) => /\d+\s*поток/.test(s))

    if (socket) specs.push({ label: 'Сокет процессора', value: socket.trim() })
    if (cores) specs.push({ label: 'Количество ядер', value: cores.trim() })
    if (threads) specs.push({ label: 'Количество потоков', value: threads.trim() })
    if (freq) specs.push({ label: 'Частота процессора', value: freq.trim() })
  }

  if (selections.mobo) {
    const chipset = selections.mobo.name.match(/(B650E|B650|B760|Z790|Z870)/i)?.[0]
    const socket = selections.mobo.specs.find((s) => /AM\d|LGA\s*\d+/i.test(s))
    const ramType = selections.mobo.specs.find((s) => /DDR\d/i.test(s))

    if (socket && !specs.some((s) => s.label === 'Сокет процессора')) {
      specs.push({ label: 'Сокет процессора', value: socket.trim() })
    }
    if (chipset) specs.push({ label: 'Чипсет материнской платы', value: chipset })
    if (ramType) specs.push({ label: 'Тип памяти', value: ramType.trim() })
  }

  if (selections.ram) {
    const type = selections.ram.specs.find((s) => /DDR\d/i.test(s))
    const total = selections.ram.name.match(/(\d+)\s*ГБ/i)?.[0] || selections.ram.name.match(/(\d+)\s*ГБ/i)?.[0]
    const freq = selections.ram.specs.find((s) => /\d+\s*МГц/i.test(s))

    if (total) specs.push({ label: 'Объём оперативной памяти', value: total })
    if (freq) specs.push({ label: 'Частота памяти', value: freq.trim() })
    if (type) {
      const existing = specs.findIndex((s) => s.label === 'Тип памяти')
      if (existing >= 0) specs[existing].value = `${type.trim()}`
    }
  }

  if (selections.gpu) {
    const gpuName = selections.gpu.name
    const memory = selections.gpu.specs.find((s) => /ГБ.*GDDR/.test(s))

    specs.push({ label: 'Графический процессор', value: gpuName })
    if (memory) specs.push({ label: 'Объём видеопамяти', value: memory.trim() })
  }

  if (selections.storage) {
    const capacity = selections.storage.specs.find((s) => /\d+\s*ТБ|\d+\s*ГБ/i.test(s))
    const interface_ = selections.storage.specs.find((s) => /PCIe|M.2|NVMe|SATA/i.test(s))

    if (interface_) specs.push({ label: 'Объём накопителя', value: `${interface_.trim()}` })
    if (capacity) specs.push({ label: 'Интерфейс накопителя', value: capacity.trim() })
  }

  if (selections.psu) {
    const wattage = selections.psu.specs.find((s) => /\d+\s*Вт/i.test(s))
    const efficiency = selections.puu?.specs.find((s) => /80\+\s*(Gold|Silver|Platinum)/i.test(s)) ||
      selections.psu.specs.find((s) => /80\+\s*(Gold|Silver|Platinum)/i.test(s))

    if (wattage) specs.push({ label: 'Мощность блока питания', value: wattage.trim() })
    if (efficiency) specs.push({ label: 'Сертификат эффективности', value: efficiency.trim() })
  }

  if (selections.case) {
    const formFactor = selections.case.specs.find((s) => /^(ATX|mATX|Micro-ATX|ITX)$/i.test(s))
    if (formFactor) specs.push({ label: 'Форм-фактор корпуса', value: formFactor.trim() })

    const support = selections.case.specs.find((s) => /поддерживает|ATX|mATX|ITX/i.test(s))
    if (support && !specs.some((s) => s.label === 'Поддерживаемые форм-факторы')) {
      specs.push({ label: 'Поддерживаемые форм-факторы', value: support.trim() })
    }
  }

  if (selections.cooling) {
    const type = selections.cooling.specs.find((s) => /Воздушное|СЖО|Кулер/i.test(s))
    if (type) {
      const typeLabel = type.includes('СЖО') ? 'СЖО' : 'Воздушное'
      specs.push({ label: 'Тип охлаждения процессора', value: typeLabel })
    }
  }

  // Sort specs: CPU-related first, then others
  const cpuSpecs = specs.filter((s) => s.label.includes('Процессор') || s.label.includes('Сокет'))
  const gpuSpecs = specs.filter((s) => s.label.includes('Видео') || s.label.includes('Графический'))
  const ramSpecs = specs.filter((s) => s.label.includes('Память') || s.label.includes('ОЗУ'))
  const storageSpecs = specs.filter((s) => s.label.includes('Накопитель'))
  const psuSpecs = specs.filter((s) => s.label.includes('Блок питания') || s.label.includes('Мощность') || s.label.includes('Питание'))
  const caseSpecs = specs.filter((s) => s.label.includes('Корпус') || s.label.includes('форм-фактор'))
  const coolingSpecs = specs.filter((s) => s.label.includes('Охлаждение') || s.label.includes('кул'))
  const otherSpecs = specs.filter((s) => !cpuSpecs.includes(s) && !gpuSpecs.includes(s) && !ramSpecs.includes(s) && !storageSpecs.includes(s) && !psuSpecs.includes(s) && !caseSpecs.includes(s) && !coolingSpecs.includes(s))

  const sortedSpecs = [
    ...cpuSpecs,
    ...gpuSpecs,
    ...ramSpecs,
    ...storageSpecs,
    ...psuSpecs,
    ...caseSpecs,
    ...coolingSpecs,
    ...otherSpecs,
  ]

  // Split into two columns
  const mid = Math.ceil(sortedSpecs.length / 2)
  const leftColumn = sortedSpecs.slice(0, mid)
  const rightColumn = sortedSpecs.slice(mid)

  if (sortedSpecs.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-text-primary hover:bg-surface-3 transition-colors"
        aria-expanded={isOpen}
      >
        <span>Характеристики сборки</span>
        {isOpen ? (
          <FiChevronUp className="h-4 w-4 text-text-muted" />
        ) : (
          <FiChevronDown className="h-4 w-4 text-text-muted" />
        )}
      </button>

      {isOpen && (
        <div className="px-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            {leftColumn.map((spec, index) => (
              <div key={`left-${index}`} className="flex items-baseline gap-2 text-sm">
                <span className="text-text-secondary shrink-0">{spec.label}</span>
                <span className="flex-1 min-w-0 border-b border-dotted border-border">{''}</span>
                <span className="shrink-0 text-text-primary">{spec.value}</span>
              </div>
            ))}
            {rightColumn.map((spec, index) => (
              <div key={`right-${index}`} className="flex items-baseline gap-2 text-sm">
                <span className="text-text-secondary shrink-0">{spec.label}</span>
                <span className="flex-1 min-w-0 border-b border-dotted border-border">{''}</span>
                <span className="shrink-0 text-text-primary">{spec.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
