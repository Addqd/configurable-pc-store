import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { FiFilter } from 'react-icons/fi'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { CatalogProductCard } from '../components/CatalogProductCard'
import { FilterDrawer } from '../components/FilterDrawer'
import {
  allCatalogProducts, PAGE_SIZE, readFilters, writeFilters, filterCatalog,
  clampPage, getPageNumbers, countProductLabel, type FilterState,
} from '../data/catalogModel'

export function CatalogPage() {
  const [searchParams,setSearchParams]=useSearchParams()
  const [filtersOpen,setFiltersOpen]=useState(false)
  const applied=useMemo(()=>readFilters(searchParams),[searchParams])
  const query=searchParams.get('q') || ''
  const [draft,setDraft]=useState<FilterState>(()=>readFilters(searchParams))
  const openButtonRef=useRef<HTMLButtonElement>(null)
  const products=useMemo(()=>filterCatalog(allCatalogProducts,applied,query),[applied,query])
  const totalPages=Math.max(1,Math.ceil(products.length/PAGE_SIZE))
  const currentPage=clampPage(searchParams.get('page'),products.length)
  const pageProducts=products.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE)
  const pagination=getPageNumbers(currentPage,totalPages)

  // Header/hamburger links may change the catalog URL while the drawer is open.
  // Close and rehydrate it so the checkboxes always reflect the new destination.
  useEffect(()=>{
    setDraft(readFilters(searchParams))
    setFiltersOpen(false)
  },[searchParams])
  useEffect(()=>{
    const raw=searchParams.get('page')
    if(raw && raw!==String(currentPage)){
      const fixed=new URLSearchParams(searchParams)
      if(currentPage===1) fixed.delete('page'); else fixed.set('page',String(currentPage))
      setSearchParams(fixed,{replace:true})
    }
  },[currentPage,searchParams,setSearchParams])

  const open=()=>{setDraft(readFilters(searchParams));setFiltersOpen(true)}
  const close=useCallback(()=>{setFiltersOpen(false);openButtonRef.current?.focus()},[])
  const apply=()=>{
    setSearchParams(writeFilters(draft,query,1)) // push: Back/Forward restores prior state
    setFiltersOpen(false)
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
      <div className="mx-auto flex max-w-[1320px] items-center justify-between px-4 py-4">
        <button ref={openButtonRef} type="button" onClick={open} aria-haspopup="dialog" aria-expanded={filtersOpen} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text-primary hover:border-border-hover hover:bg-surface-3"><FiFilter className="h-4 w-4" aria-hidden="true"/>Фильтры</button>
        <span className="text-sm text-text-muted">Найдено {products.length} {countProductLabel(products.length)}</span>
      </div>
      <div className="mx-auto max-w-[1320px] px-4 pb-6">
        {pageProducts.length ? <>
          <div className="flex flex-wrap justify-center gap-3" data-testid="catalog-grid">
            {pageProducts.map(p=><div key={p.id} className="min-w-0 w-[calc((100%-0.75rem)/2)] sm:w-[calc((100%-1.5rem)/3)] md:w-[calc((100%-2.25rem)/4)] lg:w-[calc((100%-3rem)/5)] xl:w-[calc((100%-4.5rem)/7)]"><CatalogProductCard product={p}/></div>)}
          </div>
          {totalPages>1 && <nav className="flex items-center justify-center gap-1 py-6" aria-label="Пагинация">
            <button type="button" onClick={()=>changePage(currentPage-1)} disabled={currentPage===1} aria-label="Предыдущая страница" className="flex h-9 w-9 items-center justify-center rounded-md text-text-primary hover:bg-surface-3 disabled:opacity-40">‹</button>
            {pagination.map((page,i)=>page==='…' ? <span key={`dots-${i}`} className="flex h-9 w-9 items-center justify-center text-text-muted">…</span> : <Link key={page} to={linkTo(page)} aria-label={`Страница ${page}`} aria-current={page===currentPage?'page':undefined} onClick={()=>window.scrollTo({top:0,behavior:'instant'})} className={`flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium ${page===currentPage?'bg-primary text-white dark:text-[#08090C]':'text-text-primary hover:bg-surface-3'}`}>{page}</Link>)}
            <button type="button" onClick={()=>changePage(currentPage+1)} disabled={currentPage===totalPages} aria-label="Следующая страница" className="flex h-9 w-9 items-center justify-center rounded-md text-text-primary hover:bg-surface-3 disabled:opacity-40">›</button>
          </nav>}
        </> : <div className="py-20 text-center" role="status"><h1 className="mb-2 text-lg font-medium text-text-primary">Ничего не найдено</h1><p className="text-sm text-text-muted">Попробуйте изменить параметры фильтрации или поисковый запрос.</p></div>}
      </div>
    </main>
    <Footer />
    <FilterDrawer open={filtersOpen} filters={draft} onFiltersChange={setDraft} onApply={apply} onClose={close}/>
  </div>
}
