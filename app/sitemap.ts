import type { MetadataRoute } from 'next'
import { abs } from './site'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  // Only routes that actually exist and render real content. A sitemap listing
  // a 404 is worse than a short sitemap.
  return [
    { url: abs('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: abs('/docs'), lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: abs('/skills'), lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: abs('/search'), lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: abs('/privacy'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: abs('/contact'), lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
