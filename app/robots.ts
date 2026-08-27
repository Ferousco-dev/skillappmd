import type { MetadataRoute } from 'next'
import { SITE_URL } from './site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Result pages are thin and infinite in combination. Indexing them
        // would spend crawl budget on near-duplicate pages and can look like
        // doorway content. The /search entry point itself stays indexable.
        disallow: ['/search?'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
