import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

/**
 * The mark at favicon scale. Satori cannot render an SVG string, so the four
 * records are drawn as divs with the same proportions as app/components/Logo.
 */
export default function Icon() {
  const ink = '#f3f3f6'
  const line = `2px solid ${ink}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#0b0b0f',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', left: 3, top: 3, width: 10, height: 10, border: line }} />
        <div style={{ position: 'absolute', left: 18, top: 3, width: 12, height: 8, border: line }} />
        <div style={{ position: 'absolute', left: 3, top: 18, width: 8, height: 12, border: line }} />
        <div style={{ position: 'absolute', left: 15, top: 15, width: 15, height: 15, background: ink }} />
      </div>
    ),
    size
  )
}
