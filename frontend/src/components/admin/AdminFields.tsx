import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { adminControl, adminErrorText, adminHint, adminSelect, adminTextarea } from './adminStyles'

interface BaseFieldProps {
  id: string
  label: string
  required?: boolean
  hint?: string
  error?: string
  className?: string
}

function FieldLabel({ id, label, required }: { id: string; label: string; required?: boolean }) {
  return (
    <div className="mb-1.5 flex items-center gap-1">
      <label htmlFor={id} className="text-sm font-medium text-text-primary">{label}</label>
      {required && <span className="text-text-secondary" aria-hidden="true">*</span>}
    </div>
  )
}

function FieldMessages({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  if (error) return <p id={`${id}-error`} className={adminErrorText} role="alert">{error}</p>
  if (hint) return <p id={`${id}-hint`} className={adminHint}>{hint}</p>
  return null
}

type TextFieldProps = BaseFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> & { inputClass?: string }

export function TextField({ id, label, required, hint, error, className = '', inputClass, ...props }: TextFieldProps) {
  return (
    <div className={className}>
      <FieldLabel id={id} label={label} required={required} />
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`${adminControl} ${error ? 'border-danger' : ''} ${inputClass ?? ''}`.trim()}
        {...props}
      />
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  )
}

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

type SelectFieldProps = BaseFieldProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className' | 'children'> & {
    options: readonly SelectOption[]
    placeholder?: string
  }

export function SelectField({
  id, label, required, hint, error, className = '', options, placeholder, ...props
}: SelectFieldProps) {
  return (
    <div className={className}>
      <FieldLabel id={id} label={label} required={required} />
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`${adminSelect} ${error ? 'border-danger' : ''}`.trim()}
          {...props}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  )
}

type TextareaFieldProps = BaseFieldProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'>

export function TextareaField({ id, label, required, hint, error, className = '', ...props }: TextareaFieldProps) {
  return (
    <div className={className}>
      <FieldLabel id={id} label={label} required={required} />
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`${adminTextarea} ${error ? 'border-danger' : ''}`.trim()}
        {...props}
      />
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  )
}

/**
 * Floating-label control used by the edit form, matching the reference where
 * the label sits inside the bordered field above its value.
 */
export function FloatingControl({
  id, label, children, className = '',
}: { id: string; label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-surface px-3.5 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 ${className}`}>
      <label htmlFor={id} className="block text-xs text-text-muted">{label}</label>
      {children}
    </div>
  )
}

export const floatingInputClass =
  'h-7 w-full border-0 bg-transparent p-0 text-sm text-text-primary focus:outline-none focus:ring-0'

export function Toggle({
  id, label, description, checked, onChange, disabled = false,
}: {
  id: string
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? 'bg-primary' : 'border border-border bg-surface-3'
        }`}
      >
        <span
          className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
          }`}
          style={{ height: 18, width: 18 }}
          aria-hidden="true"
        />
      </button>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight text-text-primary">{label}</p>
        {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
      </div>
    </div>
  )
}
