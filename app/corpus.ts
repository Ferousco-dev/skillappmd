/**
 * Corpus figures from our own measurement, not from any other index.
 * Source: docs/research/R2-GITSKILLS-CORPUS.md
 *   artifacts = one row per SKILL.md occurrence (3,797,117)
 *   repos     = one row per repository            (282,200)
 *
 * "Occurrence" is deliberate: the API distinguishes a canonical skill from its
 * occurrences (GET /skills/:id/occurrences), and measured duplicate share is
 * ~49.8%, so calling every occurrence a distinct skill would overstate it.
 *
 * TODO - BACKEND CONTRACT REQUIRED: build-time constants. No endpoint in
 * API.md reports corpus totals, so these cannot be read live.
 */
export const OCCURRENCE_COUNT = 3797117
export const REPOSITORY_COUNT = 282200
