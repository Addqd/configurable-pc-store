import { Link } from 'react-router'

export function NotFound() {
  return (
    <div className="min-h-screen pt-20 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-text-primary mb-4">404</h1>
        <p className="text-text-secondary mb-6">Страница не найдена</p>
        <Link to="/" className="text-primary hover:underline">
          Вернуться на главную
        </Link>
      </div>
    </div>
  )
}
