import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { FiFilter } from 'react-icons/fi'
import { Header } from '../components/Header'
import { BackButton } from '../components/BackButton'
import { Footer } from '../components/Footer'
import { CatalogProductCard } from '../components/CatalogProductCard'
import { FilterDrawer } from '../components/FilterDrawer'
import {
  readFilters, writeFilters, getPageNumbers, type FilterState,
} from '../data/catalogModel'
import { useGetFilterOptionsApiV1ProductsFiltersGet, useListProductsApiV1ProductsGet } from '../api/generated/client'
import { catalogParams, productFromSummary, resolveCatalogQuery } from '../api/catalogAdapter'

import { CatalogGridSkeleton } from '../components/skeletons/StoreSkeletons'

export function CatalogPage() {
  const { t } = useTranslation()
  const [searchParams,setSearchParams]=useSearchParams()
  const applied=useMemo(()=>readFilters(searchParams),[searchParams])
  const query=searchParams.get('q') || ''
  // The draft belongs to one concrete catalogue URL: a navigation (header link,
  // pagination, Back/Forward) always ends drawer editing and the checkboxes are
  // rehydrated from the new URL on the next open. This is React's documented
  // "adjust state when a prop changes" pattern, not an Effect + setState.
  const urlKey=searchParams.toString()
  const [editing,setEditing]=useState<FilterState|null>(null)
  const [draftUrlKey,setDraftUrlKey]=useState(urlKey)
  if (draftUrlKey!==urlKey) {
    setDraftUrlKey(urlKey)
    if (editing!==null) setEditing(null)
  }
  const filtersOpen=editing!==null
  const draft=editing??applied
  const openButtonRef=useRef<HTMLButtonElement>(null)
  const allOptions = useGetFilterOptionsApiV1ProductsFiltersGet()
  const rawPage = Number(searchParams.get('page') || 1)
  const requestedPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  // Product parameters never wait for filter metadata: a public catalog must load
  // even when /products/filters is unavailable. Selections that cannot be turned
  // into API slugs yet are left out of the request and reported to the user.
  const { params, unresolved } = resolveCatalogQuery(applied, query, requestedPage, allOptions.data)
  const notApplied = [
    unresolved.categories.length ? t('catalog.filter.categories') : null,
    unresolved.types.length ? t('catalog.filter.types') : null,
    unresolved.manufacturers.length ? t('catalog.filter.manufacturers') : null,
  ].filter((label): label is string => label !== null)
  const products = useListProductsApiV1ProductsGet(params)
  const draftParams = allOptions.data ? catalogParams(draft, '', 1, allOptions.data) : undefined
  const filteredOptions = useGetFilterOptionsApiV1ProductsFiltersGet(draftParams && {
    categories: draftParams.categories, types: draftParams.types,
  }, { query: { enabled: filtersOpen && !!draftParams } })
  const totalPages = products.data?.total_pages ?? 1
  const currentPage = Math.min(requestedPage, totalPages)
  const pageProducts = products.data?.items.map(productFromSummary) ?? []
  const pagination=getPageNumbers(currentPage,totalPages)

  // Header/hamburger links may change the catalogue URL while the drawer is open.
  // The URL key above closes it and rehydrates the draft from the new destination.
  useEffect(()=>{
    const raw=searchParams.get('page')
    if(products.data && raw && raw!==String(currentPage)){
      const fixed=new URLSearchParams(searchParams)
      if(currentPage===1) fixed.delete('page'); else fixed.set('page',String(currentPage))
      setSearchParams(fixed,{replace:true})
    }
  },[currentPage,searchParams,setSearchParams,products.data])

  const open=()=>{setEditing(readFilters(searchParams))}
  const close=useCallback(()=>{setEditing(null);openButtonRef.current?.focus()},[])
  const changeDraft=(filters:FilterState)=>setEditing(filters)
  const apply=()=>{
    const next=draft
    setEditing(null)
    setSearchParams(writeFilters(next,query,1)) // push: Back/Forward restores prior state
    openButtonRef.current?.focus()
  }
  const changePage=(page:number)=>{
    if(page===currentPage||page<1||page>totalPages) return
    setSearchParams(writeFilters(applied,query,page))
    window.scrollTo({top:0,behavior:'instant'})
  }
  const linkTo=(page:number)=>`?${writeFilters(applied,query,page).toString()}`
  return <div className="flex min-h-screen flex-col bg-surface-2">
    <Header />
    <main className="w-full flex-1 pt-[64px]">
      <div className="mx-auto max-w-[1320px] px-4 pt-4"><BackButton /></div>
      <div className="mx-auto flex max-w-[1320px] items-center justify-between px-4 py-4">
        <button ref={openButtonRef} type="button" onClick={open} aria-haspopup="dialog" aria-expanded={filtersOpen} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text-primary hover:border-border-hover hover:bg-surface-3"><FiFilter className="h-4 w-4" aria-hidden="true"/>{t('catalog.filters')}</button>
        {products.data && <span className="text-sm text-text-muted">{t('catalog.found', { count: products.data.total, count_label: t('common.product_labels', { count: products.data.total }) })}</span>}
      </div>
      <div className="mx-auto max-w-[1320px] px-4 pb-6">
        {allOptions.isError && <div role="alert" className="mb-4 flex flex-wrap items-center justify-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-muted"><span>{notApplied.length ? t('catalog.filter.partial_error', { filters: notApplied.join(', ') }) : t('catalog.filter.load_error')}</span><button type="button" onClick={() => void allOptions.refetch()} className="rounded-md border border-border bg-surface-3 px-3 py-1 text-sm font-medium text-text-primary hover:border-border-hover">{t('common.retry')}</button></div>}
        {products.isError ? <div role="alert" className="py-20 text-center text-text-muted"><p>{t('common.load_error')}</p><button type="button" onClick={() => void products.refetch()} className="mt-3 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:border-border-hover">{t('common.retry')}</button></div> : products.isLoading ? <CatalogGridSkeleton /> : pageProducts.length ? <>
          <div className="flex flex-wrap justify-center gap-3" data-testid="catalog-grid">
            {pageProducts.map(p=><div key={p.id} className="min-w-0 w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-1.5rem)/3)] md:w-[calc((100%-2.25rem)/4)] lg:w-[calc((100%-3rem)/5)] xl:w-[calc((100%-4.5rem)/7)]"><CatalogProductCard product={p}/></div>)}
          </div>
          {totalPages>1 && <nav className="flex items-center justify-center gap-1 py-6" aria-label={t('catalog.pagination')}>
            <button type="button" onClick={()=>changePage(currentPage-1)} disabled={currentPage===1} aria-label={t('catalog.prev_page')} className="flex h-9 w-9 items-center justify-center rounded-md text-text-primary hover:bg-surface-3 disabled:opacity-40">‹</button>
            {pagination.map((page,i)=>page==='…' ? <span key={`dots-${i}`} className="flex h-9 w-9 items-center justify-center text-text-muted">…</span> : <Link key={page} to={linkTo(page)} aria-label={t('catalog.page', { page })} aria-current={page===currentPage?'page':undefined} onClick={()=>window.scrollTo({top:0,behavior:'instant'})} className={`flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium ${page===currentPage?'bg-primary text-white dark:text-[#08090C]':'text-text-primary hover:bg-surface-3'}`}>{page}</Link>)}
            <button type="button" onClick={()=>changePage(currentPage+1)} disabled={currentPage===totalPages} aria-label={t('catalog.next_page')} className="flex h-9 w-9 items-center justify-center rounded-md text-text-primary hover:bg-surface-3 disabled:opacity-40">›</button>
          </nav>}
        </> : <div className="py-20 text-center" role="status"><h1 className="mb-2 text-lg font-medium text-text-primary">{t('catalog.no_results')}</h1><p className="text-sm text-text-muted">{t('catalog.no_results_desc')}</p></div>}
      </div>
    </main>
    <Footer />
    <FilterDrawer open={filtersOpen} filters={draft} onFiltersChange={changeDraft} onApply={apply} onClose={close} options={filteredOptions.data ?? allOptions.data} optionsLoading={!filteredOptions.data && !allOptions.data} />
  </div>
}
