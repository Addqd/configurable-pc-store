/** Shared class recipes for the administration screens. */
export const adminCard =
  'rounded-2xl border border-border bg-surface shadow-[0_1px_3px_var(--color-shadow)]'

export const adminControl =
  'h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60'

export const adminSelect = `${adminControl} appearance-none pr-10`

export const adminTextarea =
  'min-h-[110px] w-full rounded-lg border border-border bg-surface px-3.5 py-3 text-sm leading-relaxed text-text-primary placeholder:text-text-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60'

export const adminPrimaryButton =
  'pc-primary-button inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60'

export const adminSecondaryButton =
  'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-surface px-5 text-sm font-medium text-text-primary transition-colors hover:border-border-hover hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60'

export const adminIconButton =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition-colors hover:border-border-hover hover:bg-surface-3 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50'

export const adminTableHead =
  'border-b border-border text-left text-xs font-medium text-text-muted'

export const adminTableHeadCell = 'px-4 py-3 first:pl-0 last:pr-0'
export const adminTableCell = 'px-4 py-4 align-middle first:pl-0 last:pr-0'

export const adminDangerOutlineButton =
  'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-danger-border bg-surface px-4 text-sm font-medium text-danger transition-colors hover:bg-danger-surface disabled:cursor-not-allowed disabled:opacity-50'

export const adminLabel = 'mb-1.5 block text-sm font-medium text-text-primary'
export const adminHint = 'mt-1.5 text-xs text-text-muted'
export const adminErrorText = 'mt-1.5 text-xs text-danger'

/** Tiles in the product gallery keep the intended 3:2 presentation. */
export const galleryTile = 'relative aspect-[3/2] overflow-hidden rounded-lg border'
