import { FiX, FiFilter } from 'react-icons/fi'
import { mockProducts } from '../data/mockProducts'

export interface FilterState {
  sort: string
  categories: string[]
  types: string[]
  colors: string[]
  manufacturers: string[]
}

export const DEFAULT_FILTERS: FilterState = {
  sort: 'newest',
  categories: [],
  types: [],
  colors: [],
  manufacturers: [],
}

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Сначала новые' },
  { value: 'oldest', label: 'Сначала старые' },
  { value: 'rating_high', label: 'По рейтингу: высокий' },
  { value: 'rating_low', label: 'По рейтингу: низкий' },
  { value: 'price_asc', label: 'По цене: дешёвые' },
  { value: 'price_desc', label: 'По цене: дорогие' },
]

// Derive available filter options from actual product data
function getAvailableCategories(products: readonly any[]): string[] {
  return Array.from(new Set(products.map((p) => p.category))).sort()
}

function getAvailableTypes(products: readonly any[], category?: string): string[] {
  const filtered = category
    ? products.filter((p) => p.category === category)
    : products
  return Array.from(new Set(filtered.map((p) => p.type))).sort()
}

function getAvailableColors(products: readonly any[], category?: string, type?: string): string[] {
  let filtered = products
  if (category) filtered = filtered.filter((p) => p.category === category)
  if (type) filtered = filtered.filter((p) => p.type === type)
  return Array.from(new Set(filtered.map((p) => p.color).filter(Boolean))).sort() as string[]
}

function getAvailableManufacturers(products: readonly any[], category?: string, type?: string): string[] {
  let filtered = products
  if (category) filtered = filtered.filter((p) => p.category === category)
  if (type) filtered = filtered.filter((p) => p.type === type)
  return Array.from(new Set(filtered.map((p) => p.manufacturer))).sort()
}

export function getFilterOptions() {
  return {
    categories: getAvailableCategories(mockProducts),
    types: getAvailableTypes(mockProducts),
    colors: getAvailableColors(mockProducts),
    manufacturers: getAvailableManufacturers(mockProducts),
  }
}

interface FilterDrawerProps {
  open: boolean
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  onApply: () => void
  onClose: () => void
}

export function FilterDrawer({
  open,
  filters,
  onFiltersChange,
  onApply,
  onClose,
}: FilterDrawerProps) {
  const allOptions = getFilterOptions()
  const isCategorySelected = filters.categories.length > 0
  const isTypeSelected = filters.types.length > 0

  const types = isCategorySelected
    ? getAvailableTypes(mockProducts, filters.categories[0])
    : allOptions.types

  const colors = (() => {
    let cats = isCategorySelected ? filters.categories : []
    let typesList = isTypeSelected ? filters.types : []
    if (cats.length === 0 && typesList.length === 0) return allOptions.colors
    if (cats.length === 1 && typesList.length === 0) return getAvailableColors(mockProducts, cats[0])
    if (cats.length === 1 && typesList.length === 1)
      return getAvailableColors(mockProducts, cats[0], typesList[0])
    if (cats.length === 0 && typesList.length === 1)
      return getAvailableColors(mockProducts, undefined, typesList[0])
    return allOptions.colors
  })()

  const manufacturers = (() => {
    let cats = isCategorySelected ? filters.categories : []
    let typesList = isTypeSelected ? filters.types : []
    if (cats.length === 0 && typesList.length === 0) return allOptions.manufacturers
    if (cats.length === 1 && typesList.length === 0)
      return getAvailableManufacturers(mockProducts, cats[0])
    if (cats.length === 1 && typesList.length === 1)
      return getAvailableManufacturers(mockProducts, cats[0], typesList[0])
    if (cats.length === 0 && typesList.length === 1)
      return getAvailableManufacturers(mockProducts, undefined, typesList[0])
    return allOptions.manufacturers
  })()

  const handleCategoryChange = (category: string) => {
    const cats = filters.categories.includes(category)
      ? filters.categories.filter((c) => c !== category)
      : [...filters.categories, category]
    onFiltersChange({
      ...filters,
      categories: cats,
      types: cats.length > 0 ? [] : filters.types,
      colors: [],
      manufacturers: [],
    })
  }

  const handleTypeChange = (type: string) => {
    const types = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type]
    onFiltersChange({
      ...filters,
      types,
      colors: types.length > 0 ? [] : filters.colors,
      manufacturers: types.length > 0 ? [] : filters.manufacturers,
    })
  }

  const handleColorChange = (color: string) => {
    const colors = filters.colors.includes(color)
      ? filters.colors.filter((c) => c !== color)
      : [...filters.colors, color]
    onFiltersChange({ ...filters, colors })
  }

  const handleManufacturerChange = (mfr: string) => {
    const mfrs = filters.manufacturers.includes(mfr)
      ? filters.manufacturers.filter((m) => m !== mfr)
      : [...filters.manufacturers, mfr]
    onFiltersChange({ ...filters, manufacturers: mfrs })
  }

  const resetFilters = () => {
    onFiltersChange({ ...DEFAULT_FILTERS })
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop — dims content behind drawer, header is NOT affected */}
      <div
        className="fixed inset-0 z-[60] bg-black/40"
        onClick={onClose}
        style={{ top: '64px' }}
      />

      {/* Drawer panel */}
      <div
        className="fixed top-[64px] left-0 z-[70] flex h-[calc(100vh-64px)] w-[35vw] min-w-[300px] max-w-[420px] flex-col bg-surface border-r border-border overflow-y-auto"
        role="dialog"
        aria-label="Фильтры"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FiFilter className="w-5 h-5 text-text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">Фильтры</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-text-muted hover:bg-surface-3 hover:text-text-primary transition-colors"
            aria-label="Закрыть фильтры"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable filter sections */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Sorting */}
          <section>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Сортировка</h3>
            <div className="space-y-2">
              {SORT_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 cursor-pointer text-sm text-text-primary hover:text-primary transition-colors"
                >
                  <input
                    type="radio"
                    name="sort"
                    checked={filters.sort === opt.value}
                    onChange={() => onFiltersChange({ ...filters, sort: opt.value })}
                    className="w-4 h-4 accent-primary"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Category */}
          <section>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Категория</h3>
            <div className="space-y-2">
              {allOptions.categories.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-2.5 cursor-pointer text-sm text-text-primary hover:text-primary transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={filters.categories.includes(cat)}
                    onChange={() => handleCategoryChange(cat)}
                    className="w-4 h-4 accent-primary rounded"
                  />
                  <span>{cat}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Type */}
          {allOptions.types.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Тип</h3>
              <div className="space-y-2">
                {types.map((type) => (
                  <label
                    key={type}
                    className={`flex items-center gap-2.5 cursor-pointer text-sm transition-colors ${
                      isCategorySelected
                        ? 'text-text-primary hover:text-primary'
                        : 'text-text-muted cursor-not-allowed'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={filters.types.includes(type)}
                      onChange={() => isCategorySelected && handleTypeChange(type)}
                      disabled={!isCategorySelected}
                      className="w-4 h-4 accent-primary rounded"
                    />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* Color */}
          {allOptions.colors.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Цвет</h3>
              <div className="space-y-2">
                {colors.map((color) => (
                  <label
                    key={color}
                    className={`flex items-center gap-2.5 cursor-pointer text-sm transition-colors ${
                      (isCategorySelected || isTypeSelected)
                        ? 'text-text-primary hover:text-primary'
                        : 'text-text-muted cursor-not-allowed'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={filters.colors.includes(color)}
                      onChange={() => (isCategorySelected || isTypeSelected) && handleColorChange(color)}
                      disabled={!isCategorySelected && !isTypeSelected}
                      className="w-4 h-4 accent-primary rounded"
                    />
                    {/* Color dot */}
                    <span
                      className="w-4 h-4 rounded-full border border-border shrink-0"
                      style={{
                        backgroundColor:
                          color === 'Чёрный'
                            ? '#1a1a2e'
                            : color === 'Белый'
                              ? '#ffffff'
                              : color === 'Серебристый'
                                ? '#a0a8b4'
                                : '#6b7280',
                      }}
                    />
                    <span>{color}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* Manufacturer */}
          {allOptions.manufacturers.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Производитель</h3>
              <div className="space-y-2">
                <label
                  className="flex items-center gap-2.5 cursor-pointer text-sm text-text-primary hover:text-primary transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={filters.manufacturers.length === 0}
                    onChange={() => {
                      if (filters.manufacturers.length === 0) {
                        onFiltersChange({ ...filters, manufacturers: allOptions.manufacturers })
                      } else {
                        onFiltersChange({ ...filters, manufacturers: [] })
                      }
                    }}
                    className="w-4 h-4 accent-primary rounded"
                  />
                  <span>Все производители</span>
                </label>
                {manufacturers.map((mfr) => (
                  <label
                    key={mfr}
                    className={`flex items-center gap-2.5 cursor-pointer text-sm transition-colors ${
                      (isCategorySelected || isTypeSelected)
                        ? 'text-text-primary hover:text-primary'
                        : 'text-text-muted cursor-not-allowed'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={filters.manufacturers.includes(mfr)}
                      onChange={() =>
                        (isCategorySelected || isTypeSelected) && handleManufacturerChange(mfr)
                      }
                      disabled={!isCategorySelected && !isTypeSelected}
                      className="w-4 h-4 accent-primary rounded"
                    />
                    <span>{mfr}</span>
                  </label>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Bottom actions */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={resetFilters}
            className="flex-1 h-10 rounded-lg border border-border bg-surface-3 text-sm font-medium text-text-primary hover:bg-surface hover:border-border-hover transition-colors"
          >
            Сбросить
          </button>
          <button
            type="button"
            onClick={onApply}
            className="flex-1 h-10 rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
          >
            Применить
          </button>
        </div>
      </div>
    </>
  )
}
