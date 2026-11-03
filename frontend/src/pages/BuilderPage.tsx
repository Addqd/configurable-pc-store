import { Header } from '../components/Header'
import { Footer } from '../components/Footer'
import { BackButton } from '../components/BackButton'

export function BuilderPage() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-2">
      <Header />
      <main className="flex-1 pt-20 px-4">
        <div className="max-w-[1320px] mx-auto py-8">
          <BackButton className="mb-4" />
          <h1 className="text-2xl font-bold text-text-primary mb-6">2D-конфигуратор ПК</h1>
          <p className="text-text-secondary">Страница конфигуратора будет реализована на следующем этапе.</p>
        </div>
      </main>
      <Footer />
    </div>
  )
}
