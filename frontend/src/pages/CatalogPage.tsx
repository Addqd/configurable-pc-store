import { HiMiniCube } from 'react-icons/hi2'

export function CatalogPage() {
  return (
    <div className="min-h-screen pt-20 px-4">
      <div className="max-w-[1320px] mx-auto py-8">
        <div className="flex items-center gap-2 mb-6">
          <HiMiniCube className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold text-text-primary">Каталог товаров</h1>
        </div>
        <p className="text-text-secondary">Страница каталога будет реализована на следующем этапе.</p>
      </div>
    </div>
  )
}
