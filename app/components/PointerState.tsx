'use client'

import { useEffect } from 'react'

/**
 * Flags the document while a mouse button is held down, so the click pointer
 * can be shown for an actual press rather than for hovering something
 * clickable. CSS `:active` cannot do this: it only matches the element being
 * pressed, so the cursor would flicker as the pointer crossed gaps between
 * elements mid-drag.
 *
 * Mouse only. Touch and pen have no cursor to change.
 */
export default function PointerState() {
  useEffect(() => {
    const root = document.documentElement

    const press = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') root.classList.add('is-pressing')
    }
    const release = () => root.classList.remove('is-pressing')

    window.addEventListener('pointerdown', press)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    // A button held while the tab loses focus never fires pointerup here.
    window.addEventListener('blur', release)

    return () => {
      window.removeEventListener('pointerdown', press)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', release)
      root.classList.remove('is-pressing')
    }
  }, [])

  return null
}
