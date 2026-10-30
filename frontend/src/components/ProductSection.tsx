import type { Product } from '../data/mockProducts'
import { ProductCard } from './ProductCard'
import { HiMiniArrowRight } from 'react-icons/hi2'
import type { IconType } from 'react-icons'

interface ProductSectionProps {
  title: string
  icon: IconType
  products: Product[]
  catalogUrl: string
}

export function ProductSection({ title, icon: Icon, products, catalogUrl }: ProductSectionProps) {
  return (
    <section className="py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-text-primary">{title}</h2>
        </div>
        <a
          href={catalogUrl}
          className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary-hover font-medium transition-colors shrink-0"
        >
          Смотреть все
          <HiMiniArrowRight className="w-4 h-4" />
        </a>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
