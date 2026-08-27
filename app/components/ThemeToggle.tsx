'use client'

import { useRef } from 'react'
import { useTheme } from './useTheme'

export const THEME_STORAGE_KEY = 'skillappmd-theme'

/**
 * `startViewTransition` is not in the DOM lib yet, so it is declared narrowly
 * here rather than casting the whole document to any.
 */
type ViewTransition = {
  ready: Promise<void>
  finished: Promise<void>
  updateCallbackDone: Promise<void>
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition
}

export default function ThemeToggle() {
  const theme = useTheme()
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const next = theme === 'dark' ? 'light' : 'dark'

  const apply = () => {
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Private mode or blocked storage. The theme still applies for this
      // session; it just will not be remembered.
    }
  }

  const onClick = async () => {
    const doc = document as ViewTransitionDocument
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Firefox has no View Transitions yet, and a reduced-motion user should not
    // get a full-screen wipe. Both fall back to an instant, correct swap.
    if (!doc.startViewTransition || reduced) {
      apply()
      return
    }

    // The circle grows from the button and must reach the furthest corner, so
    // the radius is the distance to whichever corner is further away.
    const rect = buttonRef.current?.getBoundingClientRect()
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
    const y = rect ? rect.top + rect.height / 2 : 0
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )

    // The dark layer is always the thing that moves, whichever way we are
    // going. Entering dark it expands in; leaving dark it contracts out and
    // uncovers the light theme beneath. Animating the incoming snapshot in both
    // directions would read as two unrelated effects instead of one object.
    const toDark = next === 'dark'
    const root = document.documentElement
    root.dataset.themeTransition = toDark ? 'to-dark' : 'to-light'

    const closed = `circle(0px at ${x}px ${y}px)`
    const open = `circle(${radius}px at ${x}px ${y}px)`

    const cleanup = () => {
      delete root.dataset.themeTransition
    }

    const transition = doc.startViewTransition(apply)

    // A skipped transition rejects `ready`, and the browser also surfaces the
    // same failure on `finished` and `updateCallbackDone`. Any of the three
    // left without a handler becomes an uncaught rejection in the console, so
    // all three are attached to before the first await.
    transition.finished.catch(() => {})
    transition.updateCallbackDone.catch(() => {})

    // `ready` REJECTS when the browser skips the transition, which it does for
    // a hidden document or when another transition is already in flight. The
    // theme still applies, because the callback has already run; only the
    // reveal is skipped. Left unguarded this throws an unhandled rejection.
    try {
      await transition.ready
    } catch {
      cleanup()
      return
    }

    const animation = root.animate(
      { clipPath: toDark ? [closed, open] : [open, closed] },
      {
        duration: 520,
        easing: 'cubic-bezier(0.22, 0.8, 0.26, 1)',
        // Entering dark, clip the incoming dark snapshot. Leaving dark, clip
        // the outgoing dark one, which the CSS raises above the new theme.
        pseudoElement: toDark ? '::view-transition-new(root)' : '::view-transition-old(root)',
      }
    )

    animation.finished.then(cleanup, cleanup)
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={onClick}
    >
      <span className="theme-toggle-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {theme === 'dark' ? (
            <>
              <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2L5.6 5.6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </>
          ) : (
            <path
              d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </span>
    </button>
  )
}
