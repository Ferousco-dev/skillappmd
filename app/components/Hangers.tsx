'use client'

import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useTheme } from './useTheme'

type Hanger = {
  name: string
  file: string
  /** Light-on-dark variant, for marks that are near-black. */
  darkFile?: string
  /** Horizontal position as a percentage of the page width. */
  left: number
  /** Thread length in pixels before scaling. */
  drop: number
  /** Card edge length in pixels before scaling. */
  size: number
  shape: 'rounded' | 'arch' | 'circle'
  /** Phone layout: tighter spacing, shorter threads, smaller cards. */
  mobileLeft: number
  mobileDrop: number
  mobileSize: number
  /** Ambient breathing period, varied so the group never swings in lockstep. */
  idleSpeed: number
  idlePhase: number
}

const hangers: Hanger[] = [
  { name: 'Claude', file: 'claude', left: 8, drop: 250, size: 94, shape: 'rounded', mobileLeft: 6, mobileDrop: 84, mobileSize: 46, idleSpeed: 1.16, idlePhase: 0 },
  { name: 'Cursor', file: 'cursor', darkFile: 'cursor-dark', left: 14, drop: 150, size: 80, shape: 'arch', mobileLeft: 20, mobileDrop: 44, mobileSize: 40, idleSpeed: 1.37, idlePhase: 1.9 },
  { name: 'Gemini', file: 'gemini', left: 24, drop: 78, size: 68, shape: 'circle', mobileLeft: 34, mobileDrop: 72, mobileSize: 38, idleSpeed: 1.02, idlePhase: 3.4 },
  { name: 'Replit', file: 'replit', left: 35, drop: 128, size: 62, shape: 'rounded', mobileLeft: 48, mobileDrop: 36, mobileSize: 36, idleSpeed: 1.23, idlePhase: 0.7 },
  { name: 'Codex', file: 'openai', darkFile: 'openai-dark', left: 65, drop: 120, size: 64, shape: 'arch', mobileLeft: 62, mobileDrop: 76, mobileSize: 38, idleSpeed: 1.09, idlePhase: 4.6 },
  { name: 'Grok', file: 'grok', darkFile: 'grok-dark', left: 76, drop: 74, size: 70, shape: 'circle', mobileLeft: 76, mobileDrop: 40, mobileSize: 40, idleSpeed: 1.31, idlePhase: 2.3 },
  { name: 'Windsurf', file: 'windsurf', darkFile: 'windsurf-dark', left: 86, drop: 168, size: 84, shape: 'rounded', mobileLeft: 88, mobileDrop: 80, mobileSize: 44, idleSpeed: 0.97, idlePhase: 5.2 },
  { name: 'Perplexity', file: 'perplexity', left: 92, drop: 258, size: 78, shape: 'arch', mobileLeft: 96, mobileDrop: 56, mobileSize: 40, idleSpeed: 1.19, idlePhase: 1.1 },
]

// Pendulum tuning. STIFFNESS pulls back toward vertical, DAMPING bleeds off
// energy so a released hanger settles instead of swinging forever.
const STIFFNESS = 26
const DAMPING = 2.1
const MAX_ANGLE = 0.6
const IDLE_FORCE = 0.5
const BREEZE_RADIUS = 210
const PIN_HEIGHT = 6

type Motion = {
  angle: number
  velocity: number
  dragging: boolean
  pivotX: number
  pivotY: number
  centerX: number
  centerY: number
  /** Swing limits, derived from how much room the card actually has. */
  maxLeft: number
  maxRight: number
}

export default function Hangers() {
  const dark = useTheme() === 'dark'

  const containerRef = useRef<HTMLDivElement | null>(null)
  const nodesRef = useRef<(HTMLDivElement | null)[]>([])
  const motionRef = useRef<Motion[]>(
    hangers.map(() => ({
      angle: 0,
      velocity: 0,
      dragging: false,
      pivotX: 0,
      pivotY: 0,
      centerX: 0,
      centerY: 0,
      maxLeft: MAX_ANGLE,
      maxRight: MAX_ANGLE,
    }))
  )
  const draggingRef = useRef<number | null>(null)
  const pointerRef = useRef({ x: 0, y: 0, lastX: 0, velocityX: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Geometry is read from rendered rects, not from layout offsets, because an
    // ancestor transform (the hero dissolve scales the whole scene) moves what
    // is on screen without touching offsetLeft/offsetTop. Mixing the two would
    // drift the pivots apart as the scene scales.
    //
    // The pin sits exactly on the rotation origin and is a circle, so its box
    // is invariant under both the hanger's own rotation and any ancestor
    // scale. That makes it a reliable reference for the pivot and the scale.
    const measure = () => {
      nodesRef.current.forEach((node, index) => {
        if (!node) return
        const motion = motionRef.current[index]
        const pin = node.querySelector<HTMLElement>('.hanger-pin')
        const card = node.querySelector<HTMLElement>('.hanger-card')
        if (!pin || !card) return

        const pinRect = pin.getBoundingClientRect()
        if (pinRect.width === 0) return
        const cardRect = card.getBoundingClientRect()

        motion.pivotX = pinRect.left + pinRect.width / 2
        motion.pivotY = pinRect.top + pinRect.height / 2
        motion.centerX = cardRect.left + cardRect.width / 2
        motion.centerY = cardRect.top + cardRect.height / 2

        // Distance is unaffected by rotation, so this stays correct mid-swing.
        const armLength = Math.hypot(motion.centerX - motion.pivotX, motion.centerY - motion.pivotY)
        const scale = pin.offsetWidth ? pinRect.width / pin.offsetWidth : 1
        const halfCard = (card.offsetWidth * scale) / 2

        const room = (space: number) =>
          Math.min(MAX_ANGLE, Math.asin(Math.max(0, Math.min(1, space / Math.max(armLength, 1)))))
        motion.maxLeft = room(motion.pivotX - halfCard)
        motion.maxRight = room(window.innerWidth - motion.pivotX - halfCard)
      })
    }

    measure()

    const onPointerMove = (event: globalThis.PointerEvent) => {
      const pointer = pointerRef.current
      pointer.velocityX = event.clientX - pointer.lastX
      pointer.lastX = event.clientX
      pointer.x = event.clientX
      pointer.y = event.clientY

      const activeIndex = draggingRef.current
      if (activeIndex === null) return

      const motion = motionRef.current[activeIndex]
      const dx = event.clientX - motion.pivotX
      const dy = Math.max(event.clientY - motion.pivotY, 1)
      const target = Math.max(-motion.maxLeft, Math.min(motion.maxRight, Math.atan2(dx, dy)))

      // Velocity is inferred from how fast the drag is moving the arm, so
      // letting go hands the pendulum the momentum you built up.
      motion.velocity = (target - motion.angle) * 12
      motion.angle = target
    }

    const onPointerUp = () => {
      const activeIndex = draggingRef.current
      if (activeIndex === null) return
      motionRef.current[activeIndex].dragging = false
      draggingRef.current = null
      document.body.classList.remove('is-grabbing')
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)

    let raf = 0
    let last = performance.now()

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((now - last) / 1000, 0.032)
      last = now
      measure()
      const pointer = pointerRef.current
      const seconds = now / 1000

      motionRef.current.forEach((motion, index) => {
        const node = nodesRef.current[index]
        if (!node) return

        if (!motion.dragging) {
          const hanger = hangers[index]

          // A hanging card catches the draught of a cursor rushing past it.
          const distance = Math.hypot(pointer.x - motion.centerX, pointer.y - motion.centerY)
          if (distance < BREEZE_RADIUS && Math.abs(pointer.velocityX) > 1) {
            const falloff = 1 - distance / BREEZE_RADIUS
            motion.velocity += pointer.velocityX * 0.0016 * falloff * falloff
          }

          const idle = reduceMotion
            ? 0
            : IDLE_FORCE * Math.sin(seconds * hanger.idleSpeed + hanger.idlePhase)
          const acceleration = -STIFFNESS * motion.angle + idle - DAMPING * motion.velocity

          motion.velocity += acceleration * dt
          motion.angle += motion.velocity * dt

          if (motion.angle < -motion.maxLeft || motion.angle > motion.maxRight) {
            motion.angle = Math.max(-motion.maxLeft, Math.min(motion.maxRight, motion.angle))
            motion.velocity *= -0.4
          }
        }

        node.style.transform = `rotate(${motion.angle}rad)`
      })

      pointer.velocityX *= 0.82
    }

    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      document.body.classList.remove('is-grabbing')
    }
  }, [])

  const startDrag = (index: number) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    draggingRef.current = index
    motionRef.current[index].dragging = true
    pointerRef.current.lastX = event.clientX
    document.body.classList.add('is-grabbing')
  }

  return (
    <div className="hangers" aria-label="Works with" ref={containerRef}>
      {hangers.map((hanger, index) => (
        <div
          key={hanger.name}
          className="hanger"
          ref={node => {
            nodesRef.current[index] = node
          }}
          style={
            {
              '--left': `${hanger.left}%`,
              '--drop': `${hanger.drop}px`,
              '--size': `${hanger.size}px`,
              '--left-m': `${hanger.mobileLeft}%`,
              '--drop-m': `${hanger.mobileDrop}px`,
              '--size-m': `${hanger.mobileSize}px`,
            } as CSSProperties
          }
        >
          <span className="hanger-pin" aria-hidden="true" />
          <span className="hanger-thread" aria-hidden="true" />
          <span
            className={`hanger-card hanger-card--${hanger.shape}`}
            onPointerDown={startDrag(index)}
          >
            <img src={`/logos/${dark && hanger.darkFile ? hanger.darkFile : hanger.file}.svg`} alt="" draggable={false} />
          </span>
          <span className="hanger-label">{hanger.name}</span>
        </div>
      ))}
    </div>
  )
}
