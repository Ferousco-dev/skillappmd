import type { SVGProps } from 'react'

/**
 * SkillAppMD mark.
 *
 * Four records of unequal size, three drawn as outlines and one filled solid.
 * That is the product in one shape: many indexed occurrences, one resolved.
 * Measured duplicate share across the corpus is around 49.8%, so "which of
 * these is the canonical one" is literally the job.
 *
 * Drawn on a 24 unit grid with a single 2 unit stroke, no radius and no
 * gradient, so it survives one colour at any size. The solid square anchors it
 * at 16px, where four thin outlines would grey out into a smudge.
 */
export function Logo({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g stroke="currentColor" strokeWidth="2">
        <rect x="1" y="1" width="8" height="8" />
        <rect x="13" y="1" width="10" height="6" />
        <rect x="1" y="13" width="6" height="10" />
      </g>
      {/* The resolved record. Solid, and the largest. */}
      <rect x="11" y="11" width="12" height="12" fill="currentColor" />
    </svg>
  )
}

/**
 * Horizontal lockup. The wordmark is monospace to match every identifier in
 * the product, with tight tracking so it reads as one unit beside the mark.
 */
export function Logotype({
  size = 24,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-ink ${className ?? ''}`}>
      <Logo size={size} />
      <span
        className="font-mono font-medium tracking-[-0.02em]"
        style={{ fontSize: Math.round(size * 0.66) }}
      >
        SkillAppMD
      </span>
    </span>
  )
}
