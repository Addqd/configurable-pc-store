import { catalogDisplay } from '../i18n/catalogDisplay'
import { useTranslation } from 'react-i18next'
import { useMemo, useState } from 'react'
import { useBuilderStore } from '../stores/builderStore'
import { deriveBuilderSpecs, type BuildSpec } from '../data/builderSpecs'
import { FiChevronUp, FiChevronDown } from 'react-icons/fi'

export function BuilderSpecsTable() {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(true)
  const selections = useBuilderStore((state) => state.selections)
  const specs = useMemo(() => deriveBuilderSpecs(selections), [selections])
  const left = specs.slice(0, Math.ceil(specs.length / 2))
  const right = specs.slice(Math.ceil(specs.length / 2))

  const renderColumn = (items: BuildSpec[]) => (
    <div className="min-w-0 space-y-2">
      {items.map(({ label, value }) => (
        <div key={label} className="flex min-w-0 items-baseline gap-2 text-xs sm:text-sm">
          <span className="shrink-0 text-text-muted">{catalogDisplay(label)}</span>
          <span className="min-w-2 flex-1 border-b border-dotted border-border" aria-hidden="true" />
          <span className="max-w-[55%] break-words text-right font-medium text-text-primary">{catalogDisplay(value)}</span>
        </div>
      ))}
    </div>
  )

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <button type="button" onClick={() => setIsOpen((value) => !value)} aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold text-text-primary transition-colors hover:bg-surface-3">
        {t('builder.specs')}
        {isOpen ? <FiChevronUp className="h-4 w-4 shrink-0" /> : <FiChevronDown className="h-4 w-4 shrink-0" />}
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          {specs.length === 0 ? (
            <p className="text-sm text-text-muted">{t('builder.specs_placeholder')}</p>
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
