import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { catalogDisplay } from '../i18n/catalogDisplay'
import { FiX, FiFilter, FiChevronDown } from 'react-icons/fi'
import { DEFAULT_FILTERS, SORT_OPTIONS, type FilterState } from '../data/catalogModel'
import type { FilterOptionsOut } from '../api/generated/model'
export type { FilterState } from '../data/catalogModel'
export { DEFAULT_FILTERS, SORT_OPTIONS } from '../data/catalogModel'

interface Props {
  open: boolean
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  onApply: () => void
  onClose: () => void
  options: FilterOptionsOut | undefined
}
type Section = 'sort' | 'categories' | 'types' | 'colors' | 'manufacturers'
const sectionKeys: Record<Section,string> = {
  sort:'catalog.filter.sort', categories:'catalog.filter.categories', types:'catalog.filter.types', colors:'catalog.filter.colors', manufacturers:'catalog.filter.manufacturers',
}
const dotColors: Record<string,string> = { 'Чёрный':'#1a1a2e', 'Белый':'#fff', 'Серебристый':'#a0a8b4', 'Серый':'#6b7280' }
export function FilterDrawer({ open, filters, onFiltersChange, onApply, onClose, options: data }: Props) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<Section[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const available = data?.categories.map(item => item.name) ?? []
  const options = {
    categories: [...new Set([...available, ...filters.categories])],
    unavailableCategories: filters.categories.filter(name => !available.includes(name)),
    types: [...new Set(data?.types.map(item => item.name) ?? [])],
    colors: data?.colors ?? [],
    manufacturers: [...new Set(data?.manufacturers.map(item => item.name) ?? [])],
  }
  const hasCategory = filters.categories.length > 0
  const hasType = filters.types.length > 0
  const allowDetail = hasCategory || hasType
  const toggle = (section: Section) => setCollapsed(current => current.includes(section) ? current.filter(item => item!==section) : [...current,section])
  const setGroup = (field: 'categories'|'types'|'colors'|'manufacturers', value: string) => {
    const updated = filters[field].includes(value) ? filters[field].filter(v=>v!==value) : [...filters[field], value]
    const next: FilterState = { ...filters, [field]: updated }
    // Any change in a parent invalidates all dependent selections.
    if (field === 'categories') { next.types=[]; next.colors=[]; next.manufacturers=[] }
    if (field === 'types') { next.colors=[]; next.manufacturers=[] }
    onFiltersChange(next)
  }
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    panel?.querySelector<HTMLButtonElement>('button[data-filter-close]')?.focus()
    const handleKeyDown=(event: KeyboardEvent) => {
      if (event.key==='Escape') { event.preventDefault(); onClose(); return }
      if (event.key!=='Tab' || !panel) return
      const focusable=[...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[href], [tabindex]:not([tabindex="-1"])')].filter(el => el.getClientRects().length>0)
      if (!focusable.length) return
      const first=focusable[0],last=focusable[focusable.length-1]
      if (event.shiftKey && document.activeElement===first){event.preventDefault();last.focus()}
      else if (!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus()}
    }
    document.addEventListener('keydown',handleKeyDown)
    const previousOverflow=document.body.style.overflow
    document.body.style.overflow='hidden'
    return ()=>{document.removeEventListener('keydown',handleKeyDown);document.body.style.overflow=previousOverflow;previous?.focus()}
  },[open,onClose])
  if(!open) return null

  const section = (key:Section, contents:ReactNode) => <section key={key} className="border-b border-border pb-4 last:border-b-0">
    <button type="button" aria-expanded={!collapsed.includes(key)} onClick={()=>toggle(key)} className="mb-2 flex w-full items-center justify-between py-1 text-left text-sm font-semibold text-text-primary">
      {t(sectionKeys[key])}<FiChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${collapsed.includes(key)?'-rotate-90':''}`}/>
    </button>
    {!collapsed.includes(key) && <div className="space-y-2">{contents}</div>}
  </section>
  const checkbox = (field:'categories'|'types'|'colors'|'manufacturers', name:string,disabled=false) => <label key={name} className={`flex items-center gap-2.5 text-sm ${disabled?'cursor-not-allowed text-text-muted':'cursor-pointer text-text-primary hover:text-primary'}`}>
    <input type="checkbox" className="h-4 w-4 shrink-0 rounded accent-primary" checked={filters[field].includes(name)} disabled={disabled} onChange={()=>setGroup(field,name)}/>
    {field==='colors' && <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border border-border" style={{backgroundColor:dotColors[name]??'#9ca3af'}}/>}
    <span>{catalogDisplay(name)}</span>
  </label>
  return <>
    <div className="fixed inset-x-0 bottom-0 top-[64px] z-[60] bg-black/50" onClick={onClose} aria-hidden="true" data-testid="catalog-filter-backdrop"/>
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t('catalog.filter.title')} className="fixed left-0 top-[64px] z-[70] flex h-[calc(100dvh-64px)] w-full max-w-[420px] flex-col border-r border-border bg-surface shadow-xl md:w-[35vw] md:min-w-[300px]">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2 text-text-primary"><FiFilter className="h-5 w-5"/><h2 className="text-lg font-semibold">{t('catalog.filter.title')}</h2></div>
        <button type="button" data-filter-close onClick={onClose} aria-label={t('catalog.filter.close')} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-primary hover:bg-surface-3"><FiX className="h-5 w-5"/></button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {section('sort',SORT_OPTIONS.map(option=><label key={option.value} className="flex cursor-pointer items-center gap-2.5 text-sm text-text-primary hover:text-primary"><input type="radio" name="catalog-sort" checked={filters.sort===option.value} onChange={()=>onFiltersChange({...filters,sort:option.value})} className="h-4 w-4 accent-primary"/>{t('catalog.sort.' + option.value)}</label>))}
        {filters.saleOnly && <div className="rounded-lg border border-border bg-surface-3 p-3 text-sm text-text-primary">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" checked={filters.saleOnly} onChange={()=>onFiltersChange({...filters,saleOnly:false})} className="h-4 w-4 accent-primary"/>
            {t('catalog.filter.sale_only')}
          </label>
          <p className="mt-1 text-xs text-text-muted">{t('catalog.filter.sale_hint')}</p>
        </div>}
        {section('categories',options.categories.map(cat=><div key={cat}>
          {checkbox('categories',cat)}
          {options.unavailableCategories.includes(cat) && <span className="ml-7 text-xs text-text-muted">{t('catalog.category_empty')}</span>}
        </div>))}
        {section('types',options.types.map(type=>checkbox('types',type,!hasCategory)))}
        {section('colors',options.colors.map(color=>checkbox('colors',color,!allowDetail)))}
        {section('manufacturers',<>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-text-primary hover:text-primary"><input type="checkbox" className="h-4 w-4 accent-primary" checked={filters.manufacturers.length===0} onChange={()=>onFiltersChange({...filters,manufacturers:[]})}/>{t('catalog.filter.all_manufacturers')}</label>
          {options.manufacturers.map(mfr=>checkbox('manufacturers',mfr,!allowDetail))}
        </>)}
      </div>
      <div className="flex shrink-0 gap-3 border-t border-border bg-surface px-5 py-4">
        <button type="button" onClick={()=>onFiltersChange({...DEFAULT_FILTERS, categories:[],types:[],colors:[],manufacturers:[]})} className="h-10 flex-1 rounded-lg border border-border bg-surface-3 text-sm font-medium text-text-primary hover:border-border-hover">{t('catalog.filter.reset')}</button>
        <button type="button" onClick={onApply} className="h-10 flex-1 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-hover dark:text-[#08090C]">{t('catalog.filter.apply')}</button>
      </div>
    </div>
  </>
}
