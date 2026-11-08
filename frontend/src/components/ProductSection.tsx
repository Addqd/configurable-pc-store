import type { Product } from '../data/product'
import { useTranslation } from 'react-i18next'
import { ProductCard } from './ProductCard'
import { HiMiniArrowRight } from 'react-icons/hi2'
import { Link } from 'react-router'
import type { IconType } from 'react-icons'
interface ProductSectionProps { titleKey: string; icon: IconType; products: Product[]; catalogUrl: string }
export function ProductSection({ titleKey, icon: Icon, products, catalogUrl }: ProductSectionProps) {
  const { t } = useTranslation()
  return <section className="py-6">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2"><Icon className="w-5 h-5 text-primary"/><h2 className="text-lg font-bold text-text-primary">{t(titleKey)}</h2></div>
      <Link to={catalogUrl} className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary-hover font-medium transition-colors shrink-0">{t('common.view_all')}<HiMiniArrowRight className="w-4 h-4" /></Link>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {products.slice(0,6).map(product => <ProductCard key={product.id} product={product} />)}
    </div>
  </section>
}
