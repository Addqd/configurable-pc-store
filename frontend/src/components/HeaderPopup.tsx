import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

const DROPDOWN_GAP = 8
const VIEWPORT_MARGIN = 8

type Placement = 'start' | 'center' | 'stretch'

interface HeaderPopupProps {
  headerRef: RefObject<HTMLElement | null>
  anchorRef: RefObject<HTMLElement | null>
  placement: Placement
  testId: string
  children: ReactNode
}

interface Coordinates {
  top: number
  left: number
  width?: number
  ready: boolean
}

export function HeaderPopup({
  headerRef,
  anchorRef,
  placement,
  testId,
  children,
}: HeaderPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)

  const [position, setPosition] = useState<Coordinates>({
    top: 0,
    left: 0,
    ready: false,
  })

  useLayoutEffect(() => {
    const updatePosition = () => {
      const header = headerRef.current
      const anchor = anchorRef.current
      const popup = popupRef.current

      if (!header || !anchor || !popup) return

      const headerRect = header.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()

      const width =
        placement === 'stretch'
          ? anchorRect.width
          : popup.offsetWidth

      const desiredLeft =
        placement === 'center'
          ? anchorRect.left +
            anchorRect.width / 2 -
            width / 2
          : anchorRect.left

      const maxLeft = Math.max(
        VIEWPORT_MARGIN,
        window.innerWidth - width - VIEWPORT_MARGIN
      )

      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(desiredLeft, maxLeft)
      )

      const top = headerRect.bottom + DROPDOWN_GAP

      const nextWidth =
        placement === 'stretch' ? width : undefined

      setPosition((previous) => {
        if (
          previous.ready &&
          previous.top === top &&
          previous.left === left &&
          previous.width === nextWidth
        ) {
          return previous
        }

        return {
          top,
          left,
          width: nextWidth,
          ready: true,
        }
      })
    }

    updatePosition()

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updatePosition)
        : null

    if (headerRef.current) {
      observer?.observe(headerRef.current)
    }

    if (anchorRef.current) {
      observer?.observe(anchorRef.current)
    }

    if (popupRef.current) {
      observer?.observe(popupRef.current)
    }

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      observer?.disconnect()
    }
  }, [headerRef, anchorRef, placement])

  return createPortal(
    <div
      ref={popupRef}
      data-header-popup
      data-testid={testId}
      className="fixed z-[100]"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        visibility: position.ready ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body
  )
}
