import { ImageResponse } from 'next/og'
import { OCCURRENCE_COUNT, REPOSITORY_COUNT } from './corpus'

export const OG_SIZE = { width: 1200, height: 630 }

const INK = '#f3f3f6'
const MUTED = '#9c9caa'
const SURFACE = '#0b0b0f'
const ACCENT = '#d9a184'

/**
 * Shared Open Graph renderer.
 *
 * Satori (which powers ImageResponse) supports a subset of CSS: flexbox only,
 * no grid, and every element with more than one child needs an explicit
 * display. No web fonts are loaded, so rendering cannot fail on a network
 * hiccup at request time.
 */
export function renderOg({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: SURFACE,
          padding: 72,
          fontFamily: 'monospace',
        }}
      >
        {/* Mark plus wordmark. Same geometry as app/components/Logo. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ position: 'relative', display: 'flex', width: 44, height: 44 }}>
            <div style={{ position: 'absolute', left: 2, top: 2, width: 14, height: 14, border: `3px solid ${INK}` }} />
            <div style={{ position: 'absolute', left: 24, top: 2, width: 18, height: 10, border: `3px solid ${INK}` }} />
            <div style={{ position: 'absolute', left: 2, top: 24, width: 10, height: 18, border: `3px solid ${INK}` }} />
            <div style={{ position: 'absolute', left: 20, top: 20, width: 22, height: 22, background: INK }} />
          </div>
          <div style={{ fontSize: 30, color: INK, letterSpacing: -0.5 }}>SkillAppMD</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 14, height: 14, background: ACCENT }} />
            <div style={{ fontSize: 22, color: MUTED, letterSpacing: 3 }}>
              {eyebrow.toUpperCase()}
            </div>
          </div>

          <div
            style={{
              fontSize: title.length > 34 ? 62 : 78,
              color: INK,
              lineHeight: 1.08,
              letterSpacing: -2,
              marginTop: 26,
              maxWidth: 960,
            }}
          >
            {title}
          </div>

          {note && (
            <div style={{ fontSize: 26, color: MUTED, marginTop: 26, maxWidth: 900, lineHeight: 1.4 }}>
              {note}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 22, color: MUTED }}>
          <span style={{ color: INK }}>{OCCURRENCE_COUNT.toLocaleString('en-US')}</span>
          <span>SKILL.md occurrences</span>
          <span style={{ color: '#3a3a44' }}>/</span>
          <span style={{ color: INK }}>{REPOSITORY_COUNT.toLocaleString('en-US')}</span>
          <span>repositories</span>
        </div>
      </div>
    ),
    OG_SIZE
  )
}
