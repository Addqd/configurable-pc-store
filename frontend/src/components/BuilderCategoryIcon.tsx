import { type BuilderCategory } from '../stores/builderStore'

interface BuilderCategoryIconProps {
  category: BuilderCategory
  className?: string
}

/**
 * Category icon component — renders a simple SVG icon per builder category.
 * Matches the blue icon style from the configurator reference.
 */
export function BuilderCategoryIcon({ category, className }: BuilderCategoryIconProps) {
  switch (category) {
    case 'cpu':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="8" y="8" width="8" height="8" rx="1" />
          <path d="M9 1v3" /><path d="M15 1v3" /><path d="M9 20v3" /><path d="M15 20v3" />
          <path d="M20 9h3" /><path d="M20 14h3" /><path d="M1 9h3" /><path d="M1 14h3" />
        </svg>
      )
    case 'mobo':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" /><path d="M3 15h18" />
          <path d="M9 3v18" /><path d="M15 3v18" />
          <circle cx="8" cy="8" r="1" /><circle cx="16" cy="8" r="1" />
          <circle cx="8" cy="16" r="1" /><circle cx="16" cy="16" r="1" />
        </svg>
      )
    case 'gpu':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="8" cy="12" r="3" />
          <circle cx="16" cy="12" r="3" />
          <path d="M6 6V4" /><path d="M18 6V4" />
        </svg>
      )
    case 'ram':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="8" width="18" height="8" rx="1" />
          <path d="M7 8V5" /><path d="M11 8V5" /><path d="M15 8V5" /><path d="M19 8V5" />
          <path d="M7 16v3" /><path d="M11 16v3" /><path d="M15 16v3" /><path d="M19 16v3" />
        </svg>
      )
    case 'storage':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M4 9h16" />
          <path d="M8 14h2" /><path d="M8 17h4" />
        </svg>
      )
    case 'psu':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 9V6" /><path d="M12 18v-3" />
          <path d="M9 12H6" /><path d="M18 12h-3" />
        </svg>
      )
    case 'case':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <path d="M4 8h16" />
          <circle cx="8" cy="5" r="0.5" fill="currentColor" />
          <rect x="7" y="11" width="10" height="6" rx="1" />
        </svg>
      )
    case 'cooling':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v3" /><path d="M12 18v3" />
          <path d="M3 12h3" /><path d="M18 12h3" />
          <path d="M5.6 5.6l2.1 2.1" /><path d="M16.3 16.3l2.1 2.1" />
          <path d="M5.6 18.4l2.1-2.1" /><path d="M16.3 7.7l2.1-2.1" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
        </svg>
      )
  }
}
