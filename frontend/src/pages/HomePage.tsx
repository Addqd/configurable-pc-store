import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
                  {t('home.catalog_cta').split(' ').slice(0, -1).join(' ')}{' '}
                  <span className="text-primary">{t('home.catalog_cta').split(' ').slice(-1)[0]}</span>
                </>
              }
              description={t('home.catalog_description')}
              ctaText={t('home.catalog_button')}
              ctaHref="/catalog"
            />
          </div>

          {/* Banner 2 - Configurator */}
          <div className="mb-8">
            <PromotionalBanner
              backgroundImage={configuratorBg}
              title={
                <>
                  {t('home.builder_cta').split(' ').slice(0, -1).join(' ')}{' '}
                  <span className="text-primary">{t('home.builder_cta').split(' ').slice(-1)[0]}</span>
                </>
              }
              description={t('home.builder_description')}
              ctaText={t('home.builder_button')}
              ctaHref="/builder"
              paddingY="min-[1100px]:py-4"
            />
          </div>

          {/* Product Sections */}
          <ProductSection
            titleKey="home.categories.prebuilt"
            icon={HiMiniCube}
            products={prebuilts}
            catalogUrl="/catalog?category=prebuilt"
          />

          <ProductSection
            titleKey="home.categories.gpu"
            icon={HiMiniCpuChip}
            products={gpus}
            catalogUrl="/catalog?category=gpu"
          />

          <ProductSection
            titleKey="home.categories.cpu"
            icon={HiMiniCpuChip}
            products={cpus}
            catalogUrl="/catalog?category=cpu"
          />

          <ProductSection
            titleKey="home.categories.mobo"
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
