import type { MetadataRoute } from 'next'
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from './site'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME}, ${SITE_TAGLINE.toLowerCase()}`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0b0f',
    theme_color: '#0b0b0f',
    icons: [{ src: '/icon', sizes: '32x32', type: 'image/png' }],
  }
}
