import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { ErrorPage } from './ErrorPage'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback: ReactNode
  /** Changing this value clears a previous failure, e.g. on a route change. */
  resetKey?: string
}

interface ErrorBoundaryState {
  failed: boolean
  resetKey?: string
}

/**
 * Catches unexpected rendering failures and shows the approved fallback instead of
 * an unmounted subtree.
 *
 * A route change produces a new `resetKey`, so a recovered navigation renders the
 * new page rather than the failure of the previous one. Event handlers, mutations
 * and asynchronous work throw outside render and are deliberately not caught here.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { failed: true }
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    return { failed: false, resetKey: props.resetKey }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The visitor sees the approved 500 page: a message, a stack trace or any
    // internal detail never reaches the interface.
    console.error('Route rendering failed', error, info.componentStack)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Last resort if the error page itself could not render: no dependency of its own. */
function PlainServerError() {
  return (
    <main className="pc-error-page">
      <span className="pc-error-page__code">500</span>
    </main>
  )
}

/**
 * Boundary around the routed subtree.
 *
 * It lives inside the router, the theme and the i18n provider, so the fallback can
 * render while the failed page cannot. The nested boundary keeps a failure inside
 * the fallback itself from escaping to the document root.
 *
 * The reset identity is the navigation entry (`location.key`) together with the URL.
 * A URL comparison alone would trap a visitor whose homepage failed: selecting Home
 * while already at `/` is still an intentional navigation to a new entry and must be
 * able to render the page again, while a plain rerender keeps the failure.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <ErrorBoundary
      resetKey={`${location.key}${location.pathname}${location.search}`}
      fallback={(
        <ErrorBoundary resetKey="last-resort" fallback={<PlainServerError />}>
          <ErrorPage status={500} />
        </ErrorBoundary>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
