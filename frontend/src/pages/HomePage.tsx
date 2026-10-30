import { Header } from '../components/Header'
import { PromotionalBanner } from '../components/PromotionalBanner'
import { ProductSection } from '../components/ProductSection'
import { WhyChooseUs } from '../components/WhyChooseUs'
import { Footer } from '../components/Footer'
import { mockProducts } from '../data/mockProducts'
import catalogBg from '../assets/home/home-hero-catalog-bg.png'
import configuratorBg from '../assets/home/home-hero-configurator-bg.png'
import { HiMiniCube, HiMiniCpuChip, HiMiniCubeTransparent } from 'react-icons/hi2'

export function HomePage() {
  const prebuilts = mockProducts.filter((p) => p.category === 'Готовые сборки')
  const gpus = mockProducts.filter((p) => p.category === 'Видеокарты')
  const cpus = mockProducts.filter((p) => p.category === 'Процессоры')
  const mobos = mockProducts.filter((p) => p.category === 'Материнские платы')

  return (
    <div className="min-h-screen bg-surface-2">
      <Header />

      <main className="pt-20 px-4">
        <div className="max-w-[1320px] mx-auto">
          {/* Banner 1 - Catalog */}
          <div className="mt-4 mb-6">
            <PromotionalBanner
              backgroundImage={catalogBg}
              title={
                <>
                  Открыть весь{' '}
                  <span className="text-primary">каталог товаров</span>
                </>
              }
              description="Тысячи комплектующих, готовые сборки, периферия и аксессуары от ведущих брендов. Найди всё для своего ПК в одном месте."
              ctaText="Перейти в каталог"
              ctaHref="/catalog"
            />
          </div>

          {/* Banner 2 - Configurator */}
          <div className="mb-8">
            <PromotionalBanner
              backgroundImage={configuratorBg}
              title={
                <>
                  Собери{' '}
                  <span className="text-primary">свой ПК</span>
                </>
              }
              description="2D-конфигуратор поможет подобрать совместимые комплектующие и рассчитать стоимость сборки."
              ctaText="Перейти к конфигуратору"
              ctaHref="/builder"
              paddingY="min-[1100px]:py-4"
            />
          </div>

          {/* Product Sections */}
          <ProductSection
            title="Готовые сборки"
            icon={HiMiniCube}
            products={prebuilts}
            catalogUrl="/catalog?category=prebuilt"
          />

          <ProductSection
            title="Видеокарты"
            icon={HiMiniCpuChip}
            products={gpus}
            catalogUrl="/catalog?category=gpu"
          />

          <ProductSection
            title="Процессоры"
            icon={HiMiniCpuChip}
            products={cpus}
            catalogUrl="/catalog?category=cpu"
          />

          <ProductSection
            title="Материнские платы"
            icon={HiMiniCubeTransparent}
            products={mobos}
            catalogUrl="/catalog?category=mobo"
          />

          {/* Why Choose Us */}
          <div className="mt-8">
            <WhyChooseUs />
          </div>

          {/* Footer */}
          <div className="mt-8">
            <Footer />
          </div>
        </div>
      </main>
    </div>
  )
}
