import { describe, expect, it } from 'vitest'
import { mockProducts } from './mockProducts'
import {
  PAGE_SIZE, readFilters, writeFilters, filterCatalog, clampPage,
  getPageNumbers, deriveFilterOptions, DEFAULT_FILTERS, countProductLabel, CATEGORY_GROUPS,
} from './catalogModel'

describe('Catalog model — PR #4 corrections', () => {
  it('retains 51 uniquely identified fixtures and a 49-item page', () => {
    expect(mockProducts).toHaveLength(51)
    expect(new Set(mockProducts.map(p => p.id)).size).toBe(51)
    expect(new Set(mockProducts.map(p => p.slug)).size).toBe(51)
    expect(PAGE_SIZE).toBe(49)
    expect(mockProducts.every(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.addedAt))).toBe(true)
    expect(filterCatalog(mockProducts,DEFAULT_FILTERS,'').slice(0,PAGE_SIZE)).toHaveLength(49)
    expect(filterCatalog(mockProducts,DEFAULT_FILTERS,'').slice(PAGE_SIZE)).toHaveLength(2)
  })
  it('filters components as a group, not as a nonexistent exact category', () => {
    const filters=readFilters(new URLSearchParams('category=components'))
    const results=filterCatalog(mockProducts,filters,'')
    expect(filters.categories).toEqual(expect.arrayContaining([...CATEGORY_GROUPS.components]))
    expect(filters.categories).not.toContain('Комплектующие')
    expect(results).toHaveLength(36)
    expect(results.some(p=>p.category==='Видеокарты')).toBe(true)
    expect(results.some(p=>p.category==='Процессоры')).toBe(true)
    expect(results.some(p=>p.category==='Готовые сборки')).toBe(false)
  })
  it('shows precisely the real component checkboxes, never a group as a fake checkbox', () => {
    const filters = readFilters(new URLSearchParams('category=components'))
    const options = deriveFilterOptions(mockProducts, filters)
    expect(filters.categories).toHaveLength(9)
    expect(options.categories).not.toContain('Комплектующие')
    expect(options.categories.filter(category => filters.categories.includes(category))).toHaveLength(9)
    const persisted = writeFilters(filters, '', 1)
    expect(persisted.get('category')).toBe('components')
    expect(readFilters(persisted)).toEqual(filters)
  })
  it('removes one component checkbox without accidentally filtering out the other categories', () => {
    const selected = readFilters(new URLSearchParams('category=components'))
    const partial = { ...selected, categories: selected.categories.filter(category => category !== 'Видеокарты') }
    const params = writeFilters(partial, '')
    expect(params.has('categories')).toBe(true)
    expect(params.get('category')).toBeNull()
    expect(readFilters(params)).toEqual(partial)
    const results = filterCatalog(mockProducts, readFilters(params), '')
    expect(results).toHaveLength(27)
    expect(results.some(product => product.category === 'Видеокарты')).toBe(false)
    expect(results.some(product => product.category === 'Процессоры')).toBe(true)
  })
  it('maps hamburger peripheral to both peripherals and monitors, but keeps a single checkbox distinct', () => {
    const group = readFilters(new URLSearchParams('category=peripheral'))
    expect(group.categories).toEqual(['Периферия', 'Мониторы'])
    expect(filterCatalog(mockProducts, group, '')).toHaveLength(5)
    expect(writeFilters(group, '').get('category')).toBe('peripheral')
    const leaf = { ...group, categories: ['Периферия'] }
    const url = writeFilters(leaf, '')
    expect(url.get('categories')).toBe('peripheral')
    expect(url.get('category')).toBeNull()
    expect(readFilters(url).categories).toEqual(['Периферия'])
    expect(filterCatalog(mockProducts, leaf, '')).toHaveLength(3)
  })
  it('keeps menu links for empty future categories honest and clearable', () => {
    for (const slug of ['network', 'software']) {
      const filters = readFilters(new URLSearchParams(`category=${slug}`))
      expect(filters.categories).toHaveLength(1)
      expect(filterCatalog(mockProducts, filters, '')).toHaveLength(0)
      const options = deriveFilterOptions(mockProducts, filters)
      expect(options.categories).toContain(filters.categories[0])
      expect(options.unavailableCategories).toEqual([filters.categories[0]])
      expect(readFilters(writeFilters(filters, ''))).toEqual(filters)
    }
  })
  it('treats sale as a promotion facet, not a fake product category', () => {
    const filters = readFilters(new URLSearchParams('category=sale'))
    expect(filters.categories).toEqual([])
    expect(filters.saleOnly).toBe(true)
    expect(deriveFilterOptions(mockProducts, filters).categories).not.toContain('Акции')
    expect(filterCatalog(mockProducts, filters, '')).toHaveLength(0)
    expect(writeFilters(filters, '').get('category')).toBe('sale')
    expect(filterCatalog(mockProducts, { ...filters, saleOnly: false }, '')).toHaveLength(51)
  })
  it('keeps direct hamburger destinations as actual selected categories', () => {
    for (const slug of ['prebuilt', 'accessories', 'cooling', 'gpu', 'cpu', 'mobo']) {
      const filters = readFilters(new URLSearchParams(`category=${slug}`))
      expect(filters.categories).toHaveLength(1)
      expect(deriveFilterOptions(mockProducts, filters).categories).toContain(filters.categories[0])
      expect(filterCatalog(mockProducts, filters, '').length).toBeGreaterThan(0)
    }
  })
  it('round-trips deep-link category slugs without replacing them with localized names', () => {
    const parsed=readFilters(new URLSearchParams('category=gpu&q=rtx&sort=price_desc&page=2'))
    const output=writeFilters(parsed,'rtx',2)
    expect(output.get('category')).toBe('gpu')
    expect(output.get('q')).toBe('rtx')
    expect(output.get('page')).toBe('2')
    expect(output.get('sort')).toBe('price_desc')
    expect(readFilters(output)).toEqual(parsed)
  })
  it('supports comma-separated category keys and legacy labels', () => {
    const filters=readFilters(new URLSearchParams('categories=gpu,cpu'))
    expect(filters.categories).toEqual(['Видеокарты','Процессоры'])
    expect(readFilters(new URLSearchParams('categories=Видеокарты')).categories).toEqual(['Видеокарты'])
  })
  it('applies real category/type/manufacturer/color intersections', () => {
    const filters=readFilters(new URLSearchParams('category=gpu&manufacturers=MSI&colors=Чёрный&types=Игровая'))
    const result=filterCatalog(mockProducts,filters,'')
    expect(result.length).toBeGreaterThan(0)
    expect(result.every(p=>p.category==='Видеокарты'&&p.manufacturer==='MSI'&&p.color==='Чёрный')).toBe(true)
  })
  it('calculates dependent options across multiple categories, never only the first', () => {
    const options=deriveFilterOptions(mockProducts,{...DEFAULT_FILTERS,categories:['Периферия','Готовые сборки']})
    expect(options.types).toContain('Игровые ПК')
    expect(options.types).toContain('Мыши')
  })
  it('supports GPU chip manufacturer independent from board vendor', () => {
    const result=filterCatalog(mockProducts,DEFAULT_FILTERS,'nvidia')
    expect(result.some(p=>p.manufacturer==='MSI')).toBe(true)
    expect(result.some(p=>p.manufacturer==='ASUS')).toBe(true)
  })
  it('uses explicit demo insertion dates for newest/oldest', () => {
    const newer=filterCatalog(mockProducts,{...DEFAULT_FILTERS,sort:'newest'},'')
    const older=filterCatalog(mockProducts,{...DEFAULT_FILTERS,sort:'oldest'},'')
    expect(newer[0].addedAt >= newer[1].addedAt).toBe(true)
    expect(older[0].addedAt <= older[1].addedAt).toBe(true)
  })
  it('sorts prices and ratings correctly', () => {
    for(const sort of ['price_asc','price_desc','rating_high','rating_low'] as const){
      const list=filterCatalog(mockProducts,{...DEFAULT_FILTERS,sort},'')
      const metric=sort.startsWith('price')?'price':'rating'
      for(let i=1;i<list.length;i++){
        if(sort.endsWith('asc')||sort==='rating_low') expect(list[i-1][metric]).toBeLessThanOrEqual(list[i][metric])
        else expect(list[i-1][metric]).toBeGreaterThanOrEqual(list[i][metric])
      }
    }
  })
  it('clamps malformed and out-of-range pagination safely', () => {
    expect(clampPage('999',51)).toBe(2)
    expect(clampPage('-3',51)).toBe(1)
    expect(clampPage('nan',51)).toBe(1)
    expect(clampPage('3.5',51)).toBe(1)
    expect(clampPage('2',51)).toBe(2)
    expect(getPageNumbers(2,2)).toEqual([1,2])
  })
  it('pluralizes Russian product counts', () => {
    expect(countProductLabel(1)).toBe('товар')
    expect(countProductLabel(2)).toBe('товара')
    expect(countProductLabel(5)).toBe('товаров')
    expect(countProductLabel(11)).toBe('товаров')
    expect(countProductLabel(21)).toBe('товар')
  })
  it('keeps new prebuilt fixtures compatible with Product Details spec ordering', () => {
    for(const id of [45,46]) {
      const product=mockProducts.find(p=>p.id===id)!
      expect(product.specs).toHaveLength(4)
      expect(product.specs[1]).toContain('GeForce RTX')
      expect(product.specs[2]).toContain('DDR5')
      expect(product.specs[3]).toContain('SSD')
    }
  })
  it('has no contradicting declared memory speed in added G.Skill fixture', () => {
    const ram=mockProducts.find(p=>p.id===34)!
    expect(ram.name).toContain('DDR5-6400')
    expect(ram.specs).toContain('6400 МГц')
  })
})
