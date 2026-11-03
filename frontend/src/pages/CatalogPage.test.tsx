import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { CatalogPage } from './CatalogPage'
import { useCartStore } from '../stores/cartStore'
vi.mock('../components/Header',()=>({Header:()=> <div data-testid="header"/>}))
vi.mock('../components/Footer',()=>({Footer:()=> <div data-testid="footer"/>}))
function LocationView(){const loc=useLocation();return <>
  <div data-testid="location">{loc.pathname+loc.search}</div>
  <Link to="/catalog?category=components">Тестовая ссылка меню: комплектующие</Link>
</>}
function setup(path='/catalog'){
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/catalog" element={<><CatalogPage/><LocationView/></>}/></Routes></MemoryRouter>)
}
beforeEach(()=>{cleanup();useCartStore.getState().clear()})
describe('CatalogPage interactions',()=>{
  it('renders first page of 49 and navigates to page 2 through its number link',()=>{
    setup()
    expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article')).toHaveLength(49)
    fireEvent.click(screen.getByRole('link',{name:'Страница 2'}))
    expect(screen.getByTestId('location').textContent).toContain('page=2')
    expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article')).toHaveLength(2)
    expect(screen.getByTestId('footer')).toBeTruthy()
  })
  it('reflects a deep-linked GPU category with the right products',()=>{
    setup('/catalog?category=gpu')
    const cards=within(screen.getByTestId('catalog-grid')).getAllByRole('article')
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every(card=>card.textContent?.includes('Видеокарты'))).toBe(true)
  })
  it('opens and closes via Escape and cancels uncommitted draft changes',()=>{
    setup()
    fireEvent.click(screen.getByRole('button',{name:'Фильтры'}))
    const dialog=screen.getByRole('dialog',{name:'Фильтры'})
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    fireEvent.click(within(dialog).getByRole('checkbox',{name:'Готовые сборки'}))
    fireEvent.keyDown(document,{key:'Escape'})
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'Фильтры'}))
    expect((within(screen.getByRole('dialog')).getByRole('checkbox',{name:'Готовые сборки'}) as HTMLInputElement).checked).toBe(false)
  })
  it('applies filter and keeps URL canonical and filter persistent',()=>{
    setup()
    fireEvent.click(screen.getByRole('button',{name:'Фильтры'}))
    const dialog=screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('checkbox',{name:'Готовые сборки'}))
    fireEvent.click(within(dialog).getByRole('button',{name:'Применить'}))
    expect(screen.getByTestId('location').textContent).toContain('category=prebuilt')
    expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article').length).toBeGreaterThan(0)
  })
  it('preselects every actual component category without a phantom group checkbox',()=>{
    setup('/catalog?category=components')
    const cards=within(screen.getByTestId('catalog-grid')).getAllByRole('article')
    expect(cards).toHaveLength(36)
    fireEvent.click(screen.getByRole('button',{name:'Фильтры'}))
    const dialog=screen.getByRole('dialog')
    for(const name of ['Видеокарты','Процессоры','Материнские платы','Оперативная память','Накопители','Жёсткие диски','Корпуса','Блоки питания','Охлаждение']){
      expect((within(dialog).getByRole('checkbox',{name}) as HTMLInputElement).checked).toBe(true)
    }
    expect(within(dialog).queryByRole('checkbox',{name:'Комплектующие'})).toBeNull()
  })
  it('unchecks one grouped component and applies the remaining selected checkboxes',()=>{
    setup('/catalog?category=components')
    fireEvent.click(screen.getByRole('button',{name:'Фильтры'}))
    const dialog=screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('checkbox',{name:'Видеокарты'}))
    fireEvent.click(within(dialog).getByRole('button',{name:'Применить'}))
    expect(screen.getByTestId('location').textContent).toContain('categories=')
    expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article')).toHaveLength(27)
    fireEvent.click(screen.getByRole('button',{name:'Фильтры'}))
    expect((within(screen.getByRole('dialog')).getByRole('checkbox',{name:'Видеокарты'}) as HTMLInputElement).checked).toBe(false)
  })
  it('selects peripherals and monitors through the broad peripheral menu URL',()=>{
    setup('/catalog?category=peripheral')
    expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button',{name:'Фильтры'}))
    const dialog=screen.getByRole('dialog')
    expect((within(dialog).getByRole('checkbox',{name:'Периферия'}) as HTMLInputElement).checked).toBe(true)
    expect((within(dialog).getByRole('checkbox',{name:'Мониторы'}) as HTMLInputElement).checked).toBe(true)
  })
  it('treats sale as a facet with no fake category and can clear it via Apply',()=>{
    setup('/catalog?category=sale')
    expect(screen.getByText('Ничего не найдено')).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'Фильтры'}))
    const dialog=screen.getByRole('dialog')
    expect(within(dialog).queryByRole('checkbox',{name:'Акции'})).toBeNull()
    fireEvent.click(within(dialog).getByRole('checkbox',{name:'Только товары по акции'}))
    fireEvent.click(within(dialog).getByRole('button',{name:'Применить'}))
    expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article')).toHaveLength(49)
  })
  it('updates selected checkboxes and closes an open drawer when a menu link changes URL',()=>{
    setup('/catalog?category=prebuilt')
    fireEvent.click(screen.getByRole('button',{name:'Фильтры'}))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('link',{name:'Тестовая ссылка меню: комплектующие'}))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(screen.getByTestId('catalog-grid')).getAllByRole('article')).toHaveLength(36)
    fireEvent.click(screen.getByRole('button',{name:'Фильтры'}))
    const dialog=screen.getByRole('dialog')
    expect((within(dialog).getByRole('checkbox',{name:'Видеокарты'}) as HTMLInputElement).checked).toBe(true)
    expect((within(dialog).getByRole('checkbox',{name:'Готовые сборки'}) as HTMLInputElement).checked).toBe(false)
  })
  it('adds to cart without navigating',()=>{
    setup()
    const buttons=within(screen.getByTestId('catalog-grid')).getAllByRole('button',{name:/Добавить в корзину/})
    fireEvent.click(buttons[0])
    expect(useCartStore.getState().items).toHaveLength(1)
    expect(screen.getByTestId('location').textContent).toBe('/catalog')
  })
})
