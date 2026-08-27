import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, abs } from './site'

/**
 * JSON-LD for the site.
 *
 * WebSite plus SoftwareApplication, because SkillAppMD is a developer tool
 * rather than a company brochure. No aggregateRating and no review: inventing
 * either would be fabricated structured data, which is a manual-action risk and
 * dishonest besides.
 *
 * SearchAction is declared because /search accepts a real ?q= parameter.
 */
export default function StructuredData() {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': abs('/#website'),
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: 'en',
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: abs('/search?q={search_term_string}'),
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': abs('/#app'),
        name: SITE_NAME,
        alternateName: SITE_TAGLINE,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Any',
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  )
}
