import { HiMiniArrowRight } from 'react-icons/hi2'

interface PromotionalBannerProps {
  backgroundImage: string
  title: React.ReactNode
  description: string
  ctaText: string
  ctaHref: string
}

export function PromotionalBanner({
  backgroundImage,
  title,
  description,
  ctaText,
  ctaHref,
}: PromotionalBannerProps) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-primary/5 to-primary/10">
      {/* Full-width image */}
      <img
        src={backgroundImage}
        alt=""
        className="w-full h-auto block"
      />
      {/* Text overlay */}
      <div className="absolute inset-0 flex flex-col justify-center">
        <div className="w-full px-6 lg:px-10 max-w-lg">
          <h2 className="text-xl lg:text-2xl font-bold text-text-primary mb-2 leading-tight lg:mb-3">
            {title}
          </h2>
          <p className="text-xs lg:text-sm text-text-secondary mb-4 lg:mb-6 leading-relaxed">
            {description}
          </p>
          <a
            href={ctaHref}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-hover text-white font-medium px-5 py-2.5 lg:px-6 lg:py-3 rounded-lg text-sm transition-colors self-start"
          >
            {ctaText}
            <HiMiniArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  )
}
