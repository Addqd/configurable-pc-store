import { ErrorPage } from '../components/error/ErrorPage'

/**
 * Wildcard route: the unmatched URL is displayed as the fullscreen 404 page at that
 * same URL, so a reload or a shared link keeps pointing at the address that failed.
 */
export function NotFound() {
  return <ErrorPage status={404} />
}
