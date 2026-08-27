'use client'

import { LANDING_RESET_EVENT } from './HeroStage'
import { Logo } from './Logo'

/**
 * The brand mark is the only way back to the landing hero once it has
 * dissolved. It stays a real <a href="/"> so it still works without
 * JavaScript, or when opened in a new tab; the click is intercepted only to
 * restore the hero in place, which avoids a full page reload.
 */
export default function BrandLink() {
  return (
    <a
      className="brand"
      href="/"
      aria-label="SkillAppMD home"
      onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        window.dispatchEvent(new Event(LANDING_RESET_EVENT))
      }}
    >
      <Logo size={26} />
    </a>
  )
}
