import { Link } from 'react-router'
import { HiMiniArrowRight } from 'react-icons/hi2'

export function EmptyCart() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg className="w-20 h-20 text-text-muted mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.8 7M17 13l1.8 7M13 5v8M13 13V5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h2 className="text-xl font-semibold text-text-primary mb-2">Корзина пуста</h2>
      <p className="text-sm text-text-muted mb-6 max-w-sm">
        Добавьте товары из каталога, чтобы оформить заказ
      </p>
      <Link
        to="/catalog"
        className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
      >
        Перейти в каталог
        <HiMiniArrowRight className="w-4 h-4" />
      </Link>
    </div>
  )
}
