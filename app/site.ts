/**
 * Single source of truth for anything SEO or metadata needs.
 *
 * SITE_URL must be set in production or Open Graph images, canonicals and the
 * sitemap will all point at localhost. Everything else derives from here so a
 * name or description is never written twice.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  ''
)

export const SITE_NAME = 'SkillAppMD'

export const SITE_TAGLINE = 'A resolver for agent skills'

export const SITE_DESCRIPTION =
  'SkillAppMD indexes public SKILL.md files, records where each one came from and whether you are allowed to use it, and tells your coding agent which skill it needs for the task at hand.'

/** Used for keyword-adjacent copy and the structured data description. */
export const SITE_KEYWORDS = [
  'agent skills',
  'SKILL.md',
  'AI coding agents',
  'skill index',
  'skill provenance',
  'open source licences',
  'Claude Code',
  'Cursor',
  'Codex',
]

export const abs = (path = '/') => `${SITE_URL}${path}`
