
import { Link } from 'react-router'
import { HiMiniArrowRight } from 'react-icons/hi2'
import type { ReactNode } from 'react'

interface PromotionalBannerProps {
  backgroundImage: string
  title: ReactNode
  description: string
  ctaText: string
  ctaHref: string
  paddingY?: string
}

export function PromotionalBanner({
  backgroundImage,
  title,
  description,
  ctaText,
  ctaHref,
  paddingY = '',
}: PromotionalBannerProps) {
  const isBuilder = ctaHref === '/builder'

  return (
    <div
      data-testid="promotional-banner"
      className="relative w-full overflow-hidden rounded-2xl"
    >
      <img
        src={backgroundImage}
        alt=""
        className="block w-full h-auto"
      />

      <div
        className="
          px-5 py-5
          min-[1100px]:absolute
          min-[1100px]:inset-0
          min-[1100px]:flex
          min-[1100px]:items-center
          min-[1100px]:p-0
        "
      >
        <div
          data-testid="banner-content"
          className={`
            min-w-0
            min-[1100px]:w-[43%]
            min-[1100px]:pl-[clamp(20px,3vw,52px)]
            min-[1100px]:pr-3
            ${paddingY}
          `}
        >
          <h2
            className="
              font-bold text-text-primary
              text-[clamp(18px,1.6vw,28px)]
              leading-[1.15]
              mb-[clamp(6px,0.55vw,10px)]
            "
            style={isBuilder ? { marginBottom: 4 } : undefined}
          >
            {title}
          </h2>

          <p
            className="
              text-text-secondary
              text-[clamp(12px,0.9vw,16px)]
              leading-[1.4]
              mb-[clamp(6px,0.8vw,16px)]
            "
            style={isBuilder ? { marginBottom: 6 } : undefined}
          >
            {description}
          </p>

          <Link
            to={ctaHref}
            className="
              inline-flex items-center gap-2
              rounded-lg bg-primary text-white
              font-medium
              text-[clamp(12px,0.85vw,15px)]
              px-[clamp(14px,1.5vw,28px)]
              py-[clamp(7px,0.8vw,12px)]
              transition-colors
              hover:bg-primary-hover
            "
            style={
              isBuilder
                ? { paddingTop: 6, paddingBottom: 6 }
                : undefined
            }
          >
            {ctaText}
            <HiMiniArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
