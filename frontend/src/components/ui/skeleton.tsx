import { cn } from "cn"

/**
 * A single loading placeholder.
 *
 * The shimmer itself lives in `index.css` (`pc-skeleton`), so every placeholder
 * of the application shares one animation and one theme-derived tone instead of
 * shipping its own gradient. Placeholders are decorative: the surrounding
 * `SkeletonRegion` carries the accessible loading announcement.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("pc-skeleton rounded-md", className)}
      {...props}
    />
  )
}

/**
 * Inline variant, for a placeholder that must stay inside a text flow such as a
 * sentence or a table cell paragraph. Rendering the `div` variant there would
 * produce invalid markup (`div` inside `p`), so this one is a `span`.
 */
function SkeletonText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("pc-skeleton inline-block rounded-sm", className)}
      {...props}
    />
  )
}

export { Skeleton, SkeletonText }
