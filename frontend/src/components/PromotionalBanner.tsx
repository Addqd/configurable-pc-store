import { HiMiniArrowRight } from 'react-icons/hi2'

interface PromotionalBannerProps {
  backgroundImage: string
  title: React.ReactNode
  description: string
  ctaText: string
  ctaHref: string
}

interface PromotionalBannerProps {
  backgroundImage: string
  title: React.ReactNode
  description: string
  ctaText: string
  ctaHref: string
  imageObjectPosition?: string
}

export function PromotionalBanner({
  backgroundImage,
  title,
  description,
  ctaText,
  ctaHref,
  imageObjectPosition = 'center right',
}: PromotionalBannerProps) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-primary/5 to-primary/10">
      <div className="flex flex-col lg:flex-row items-stretch">
        {/* Text content */}
        <div className="lg:w-[40%] p-6 lg:p-10 flex flex-col justify-center z-10">
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

        {/* Background image */}
        <div className="lg:w-[60%] relative h-[120px] lg:h-auto lg:min-h-[160px]">
          <img
            src={backgroundImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: imageObjectPosition }}
          />
        </div>
      </div>
    </div>
  )
}
