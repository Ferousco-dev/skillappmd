'use client'

import { useEffect, useRef, type ReactNode } from 'react'

export const LANDING_RESET_EVENT = 'landing:reset'

/**
 * Scroll-linked hero dissolve, one way only.
 *
 * The stage is taller than the viewport and the hero box inside it is sticky,
 * so the hero holds still while the page scrolls past it. Progress through the
 * stage is published as `--hero-progress` (0 to 1), which the CSS turns into a
 * scale-up plus a fade: the effect of pushing through the hero rather than
 * scrolling it away.
 *
 * Once it has fully dissolved the stage is removed from the layout and the
 * scroll position is reset, so scrolling back up cannot resurrect the landing.
 * Only the brand mark brings it back, by dispatching LANDING_RESET_EVENT.
 */
export default function HeroStage({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const stage = stageRef.current
    const scene = sceneRef.current
    if (!stage || !scene) return

    const root = document.documentElement
    let frame = 0
    let previous = -1
    let dissolved = false

    const update = () => {
      frame = 0
      if (dissolved) return

      const scrollable = stage.offsetHeight - window.innerHeight
      const travelled = -stage.getBoundingClientRect().top
      const progress = scrollable > 0 ? Math.max(0, Math.min(1, travelled / scrollable)) : 0

      if (progress !== previous) {
        previous = progress
        scene.style.setProperty('--hero-progress', progress.toFixed(4))
        // Invisible but still hit-testable, so it would otherwise swallow
        // clicks meant for what sits underneath.
        scene.style.pointerEvents = progress > 0.85 ? 'none' : ''
      }

      if (progress >= 1) {
        dissolved = true
        root.classList.add('is-dissolved')
        // The stage leaves the layout, so anchor the reader at the top of what
        // replaces it rather than leaving them scrolled into empty space.
        window.scrollTo(0, 0)
      }
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    const reset = () => {
      dissolved = false
      previous = -1
      root.classList.remove('is-dissolved')
      scene.style.setProperty('--hero-progress', '0')
      scene.style.pointerEvents = ''
      window.scrollTo(0, 0)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    window.addEventListener(LANDING_RESET_EVENT, reset)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener(LANDING_RESET_EVENT, reset)
      root.classList.remove('is-dissolved')
    }
  }, [])

  return (
    <div className="hero-stage" ref={stageRef}>
      <div className="page">
        <div className="hero-scene" ref={sceneRef}>
          {children}
        </div>
      </div>
    </div>
  )
}
