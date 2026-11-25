import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiMinus, FiPlus, FiSearch } from 'react-icons/fi'
import { adminControl } from './adminStyles'
import {
  DIMENSION_COUNT,
  DIMENSION_UNIT,
  MAX_QUANTITY,
  type CharacteristicDefinitionLike,
  type CharacteristicDraft,
  type DimensionInputs,
  editorOf,
} from '../../admin/characteristicDrafts'
import {
  characteristicLabel,
  translateCharacteristicCategoricalValue,
  translateCharacteristicUnit,
} from '../../i18n/characteristics'

const optionLabel = (value: string, language: string) =>
  translateCharacteristicCategoricalValue(value, language)

/**
 * One category-scoped characteristic control.
 *
 * Every selectable value comes from the category definitions endpoint, so the
 * editor can only pick an existing dictionary option — typing into the search box
 * filters that dictionary and never creates a new value. The only field that is
 * not a dictionary pick is the GPU dimensions triple.
 */
export function CharacteristicFieldEditor({
  field,
  draft,
  disabled,
  error,
  onChange,
}: {
  field: CharacteristicDefinitionLike
  draft: CharacteristicDraft
  disabled: boolean
  error?: string
  onChange: (patch: Partial<CharacteristicDraft>) => void
}) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'ru'
  const controlId = `characteristic-${field.code}`
  const editor = editorOf(field)
  const options = field.options ?? []
  // The stored definition label/unit are Russian; the English editor shows the
  // same dictionary the storefront uses, keyed by the stable `code`.
  const name = characteristicLabel(field, language)
  const unitText = translateCharacteristicUnit(field.unit, language)
  const unit = unitText ? (
    <span className="ml-1 whitespace-nowrap text-text-muted">{unitText}</span>
  ) : null
  const label = (
    <label htmlFor={editor === 'dimensions' ? `${controlId}-0` : controlId} className="flex min-w-0 items-center text-sm text-text-primary">
      <span className="truncate">{name}</span>
      {unit}
      {field.is_required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
    </label>
  )

  const toggle = (optionId: number) => {
    const selected = draft.selected.includes(optionId)
      ? draft.selected.filter((id) => id !== optionId)
      : [...draft.selected, optionId]
    const quantities = { ...draft.quantities }
    if (!selected.includes(optionId)) delete quantities[optionId]
    else if (quantities[optionId] === undefined) quantities[optionId] = 1
    onChange({ selected, quantities })
  }

  const setQuantity = (optionId: number, quantity: number) => {
    const bounded = Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(quantity) || 1))
    onChange({ quantities: { ...draft.quantities, [optionId]: bounded } })
  }

  return (
    <div className="grid items-start gap-3 sm:grid-cols-2">
      <div className="flex min-h-11 items-center rounded-lg border border-border bg-surface-2 px-3.5 text-sm text-text-primary">
        {label}
      </div>
      <div className="min-w-0">
        {editor === 'dimensions' ? (
          <DimensionInputsField
            idPrefix={controlId}
            values={draft.dimensions}
            disabled={disabled}
            invalid={Boolean(error)}
            onChange={(dimensions) => onChange({ dimensions })}
          />
        ) : editor === 'select' || editor === 'boolean' ? (
          <SingleOptionSelect
            id={controlId}
            name={name}
            options={options}
            language={language}
            value={draft.selected[0]}
            disabled={disabled}
            invalid={Boolean(error)}
            onChange={(optionId) => onChange({ selected: optionId === null ? [] : [optionId] })}
          />
        ) : (
          <OptionChecklist
            idPrefix={controlId}
            name={name}
            options={options}
            language={language}
            draft={draft}
            repeatable={editor === 'connector_quantity'}
            disabled={disabled}
            onToggle={toggle}
            onQuantity={setQuantity}
          />
        )}
        {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    </div>
  )
}

/** Searchable single choice over the existing dictionary values. */
function SingleOptionSelect({
  id,
  name,
  options,
  language,
  value,
  disabled,
  invalid,
  onChange,
}: {
  id: string
  name: string
  options: readonly { option_id: number; value: string }[]
  language: string
  value: number | undefined
  disabled: boolean
  invalid: boolean
  onChange: (optionId: number | null) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    if (!needle) return options
    return options.filter((option) =>
      optionLabel(option.value, language).toLocaleLowerCase().includes(needle),
    )
  }, [options, search, language])
  const unknown = value !== undefined && !options.some((option) => option.option_id === value)

  return (
    <div className="space-y-2">
      <div className="relative">
        <FiSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={search}
          disabled={disabled}
          aria-label={`${t('admin.form.char_select_search')}: ${name}`}
          placeholder={t('admin.form.char_select_placeholder')}
          onChange={(event) => setSearch(event.target.value)}
          className={`${adminControl} pl-9`}
        />
      </div>
      <select
        id={id}
        value={value === undefined ? '' : String(value)}
        disabled={disabled}
        aria-invalid={invalid}
        aria-label={name}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        className={adminControl}
      >
        <option value="">{t('admin.form.char_select_clear')}</option>
        {unknown && (
          <option value={String(value)}>{t('admin.form.char_option_unknown', { id: value })}</option>
        )}
        {filtered.map((option) => (
          <option key={option.option_id} value={String(option.option_id)}>
            {optionLabel(option.value, language)}
          </option>
        ))}
      </select>
      {filtered.length === 0 && (
        <p className="text-xs text-text-muted">{t('admin.form.char_select_empty')}</p>
      )}
      <p className="text-xs text-text-muted">
        {t('admin.form.char_options_count', { count: options.length })}
      </p>
    </div>
  )
}

/** Searchable multiple choice, optionally with a repeat count per option. */
function OptionChecklist({
  idPrefix,
  name,
  options,
  language,
  draft,
  repeatable,
  disabled,
  onToggle,
  onQuantity,
}: {
  idPrefix: string
  name: string
  options: readonly { option_id: number; value: string }[]
  language: string
  draft: CharacteristicDraft
  repeatable: boolean
  disabled: boolean
  onToggle: (optionId: number) => void
  onQuantity: (optionId: number, quantity: number) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const known = useMemo(() => new Set(options.map((option) => option.option_id)), [options])
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    if (!needle) return options
    return options.filter((option) =>
      optionLabel(option.value, language).toLocaleLowerCase().includes(needle),
    )
  }, [options, search, language])
  const labelFor = (optionId: number) => {
    const option = options.find((item) => item.option_id === optionId)
    return option
      ? optionLabel(option.value, language)
      : t('admin.form.char_option_unknown', { id: optionId })
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <FiSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={search}
          disabled={disabled}
          aria-label={`${t('admin.form.char_select_search')}: ${name}`}
          placeholder={t('admin.form.char_select_placeholder')}
          onChange={(event) => setSearch(event.target.value)}
          className={`${adminControl} pl-9`}
        />
      </div>
      <div
        role="group"
        aria-label={name}
        className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface-2 p-2"
      >
        {filtered.length === 0 && (
          <p className="px-1 py-2 text-xs text-text-muted">{t('admin.form.char_select_empty')}</p>
        )}
        {filtered.map((option) => (
          <label
            key={option.option_id}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-text-primary hover:bg-surface-3"
          >
            <input
              type="checkbox"
              id={`${idPrefix}-${option.option_id}`}
              checked={draft.selected.includes(option.option_id)}
              disabled={disabled}
              onChange={() => onToggle(option.option_id)}
            />
            <span className="min-w-0 truncate">{optionLabel(option.value, language)}</span>
          </label>
        ))}
      </div>

      {repeatable && draft.selected.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-2">
          <p className="px-1 text-xs font-medium text-text-secondary">
            {t('admin.form.char_multiselect_selected')}
          </p>
          {draft.selected.map((optionId) => {
            const quantity = draft.quantities[optionId] ?? 1
            return (
              <div key={optionId} className="flex items-center justify-between gap-2 px-1">
                <span className={`min-w-0 truncate text-sm ${known.has(optionId) ? 'text-text-primary' : 'text-danger'}`}>
                  {labelFor(optionId)}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={disabled || quantity <= 1}
                    aria-label={`${t('admin.form.char_quantity_decrease')}: ${labelFor(optionId)}`}
                    onClick={() => onQuantity(optionId, quantity - 1)}
                    className="rounded-md border border-border p-1 text-text-primary hover:bg-surface-3 disabled:opacity-40"
                  >
                    <FiMinus className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={MAX_QUANTITY}
                    step={1}
                    value={quantity}
                    disabled={disabled}
                    aria-label={`${t('admin.form.char_quantity')}: ${labelFor(optionId)}`}
                    onChange={(event) => onQuantity(optionId, Number(event.target.value))}
                    className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-center text-sm text-text-primary"
                  />
                  <button
                    type="button"
                    disabled={disabled || quantity >= MAX_QUANTITY}
                    aria-label={`${t('admin.form.char_quantity_increase')}: ${labelFor(optionId)}`}
                    onClick={() => onQuantity(optionId, quantity + 1)}
                    className="rounded-md border border-border p-1 text-text-primary hover:bg-surface-3 disabled:opacity-40"
                  >
                    <FiPlus className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs text-text-muted">
        {t('admin.form.char_options_count', { count: options.length })}
      </p>
    </div>
  )
}

/** Exactly three millimetre measurements; there is no add/remove control. */
function DimensionInputsField({
  idPrefix,
  values,
  disabled,
  invalid,
  onChange,
}: {
  idPrefix: string
  values: DimensionInputs
  disabled: boolean
  invalid: boolean
  onChange: (values: DimensionInputs) => void
}) {
  const { t } = useTranslation()
  const labels = [
    t('admin.form.char_dimensions_length'),
    t('admin.form.char_dimensions_width'),
    t('admin.form.char_dimensions_height'),
  ]
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {labels.map((label, index) => (
          <div key={label} className="min-w-0">
            <label htmlFor={`${idPrefix}-${index}`} className="mb-1 block text-xs text-text-muted">
              {label}
            </label>
            <input
              id={`${idPrefix}-${index}`}
              type="text"
              inputMode="decimal"
              value={values[index]}
              disabled={disabled}
              aria-invalid={invalid}
              onChange={(event) => {
                const next = [...values] as DimensionInputs
                next[index] = event.target.value
                onChange(next)
              }}
              className={`${adminControl} text-center`}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-text-muted">
        {t('admin.form.char_dimensions_hint')} ({DIMENSION_COUNT} × {DIMENSION_UNIT})
      </p>
    </div>
  )
}
