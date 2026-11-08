import { useTranslation } from 'react-i18next'
import { Header } from '../components/Header'
import { PromotionalBanner } from '../components/PromotionalBanner'
import { ProductSection } from '../components/ProductSection'
import { WhyChooseUs } from '../components/WhyChooseUs'
import { Footer } from '../components/Footer'
import { useListProductsApiV1ProductsGet } from '../api/generated/client'
import { productFromSummary } from '../api/catalogAdapter'
import catalogBg from '../assets/home/home-hero-catalog-bg.png'
import configuratorBg from '../assets/home/home-hero-configurator-bg.png'
import { HiMiniCube, HiMiniCpuChip, HiMiniCubeTransparent } from 'react-icons/hi2'

export function HomePage() {
  const { t } = useTranslation()
  const prebuilts = useListProductsApiV1ProductsGet({ category: 'prebuilt', page_size: 6 })
  const gpus = useListProductsApiV1ProductsGet({ category: 'gpu', page_size: 6 })
  const cpus = useListProductsApiV1ProductsGet({ category: 'cpu', page_size: 6 })
  const mobos = useListProductsApiV1ProductsGet({ category: 'mobo', page_size: 6 })

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
          {[prebuilts, gpus, cpus, mobos].some(result => result.isError) && <p role="alert" className="text-sm text-red-500">{t('common.load_error')}</p>}
          <ProductSection
            titleKey="home.categories.prebuilt"
            icon={HiMiniCube}
            products={(prebuilts.data?.items ?? []).map(productFromSummary)}
            catalogUrl="/catalog?category=prebuilt"
          />

          <ProductSection
            titleKey="home.categories.gpu"
            icon={HiMiniCpuChip}
            products={(gpus.data?.items ?? []).map(productFromSummary)}
            catalogUrl="/catalog?category=gpu"
          />

          <ProductSection
            titleKey="home.categories.cpu"
            icon={HiMiniCpuChip}
            products={(cpus.data?.items ?? []).map(productFromSummary)}
            catalogUrl="/catalog?category=cpu"
          />

          <ProductSection
            titleKey="home.categories.mobo"
            icon={HiMiniCubeTransparent}
            products={(mobos.data?.items ?? []).map(productFromSummary)}
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
