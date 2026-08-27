import type { SVGProps } from 'react'

/* ------------------------------------------------------------------------- *
 * The two pointer icons, plus a serialiser that turns the same path data into
 * a data URI for the native CSS `cursor` property. One source of truth, so the
 * rendered icon and the live cursor cannot drift apart.
 * ------------------------------------------------------------------------- */

export function MousePointer2Icon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/></svg>
  )
}

export function MousePointerClickIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 4.1L12 6M5.1 8l-2.9-.8M6 12l-1.9 2M7.2 2.2L8 5.1m1.037 4.59a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/></svg>
  )
}

const INK = '#111116'
const INK_DARK = '#f3f3f6'
const HALO_DARK = '#0b0b0f'

/**
 * Path data split so the arrow body can be filled independently of the spark
 * rays, which must stay open strokes. The click icon's body is written here in
 * absolute terms; in the component above it is a relative `m` continuing from
 * the end of the last spark.
 */
const ICONS = {
  pointer: {
    body:
      'M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58' +
      'a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z',
    rays: '',
    /** The arrow tip, in the 24-unit viewBox. */
    tip: 4.3,
  },
  click: {
    body:
      'M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041' +
      'a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z',
    rays: 'M14 4.1L12 6M5.1 8l-2.9-.8M6 12l-1.9 2M7.2 2.2L8 5.1',
    tip: 9.2,
  },
} as const

export type CursorIconName = keyof typeof ICONS

/**
 * Build a `cursor` value: `url("data:...") x y`.
 *
 * A white under-stroke is painted beneath the black one so the pointer stays
 * legible over dark content, such as the split-flap tiles. The icons rendered
 * in the page keep their plain `currentColor` styling.
 */
export function cursorImage(
  name: CursorIconName,
  { filled = false, size = 24, dark = false } = {}
) {
  const icon = ICONS[name]
  const ink = dark ? INK_DARK : INK
  const halo = dark ? HALO_DARK : '#ffffff'
  const paths = (extra = '') =>
    `<path d='${icon.body}'${extra}/>` + (icon.rays ? `<path d='${icon.rays}'/>` : '')

  const markup =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24'>` +
    `<g fill='none' stroke='${halo}' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round' opacity='0.92'>` +
    paths() +
    `</g>` +
    `<g fill='none' stroke='${ink}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>` +
    paths(filled ? ` fill='${ink}'` : '') +
    `</g></svg>`

  const hotspot = Math.round((icon.tip * size) / 24)

  return `url("data:image/svg+xml,${encodeURIComponent(markup)}") ${hotspot} ${hotspot}`
}
