import type { Attribution, Skill } from '@/lib/api/types'

/**
 * Builds the prompt a developer hands to their coding agent.
 *
 * This is the product's actual output. SkillAppMD never serves skill content
 * (API.md section 5), so the prompt does not contain the file. It contains the
 * pointer plus the rights position, and instructs the agent to fetch from the
 * origin repository itself.
 *
 * The licence line changes with the rights posture rather than being boilerplate.
 * There are two states, not three: a licence that forbids redistribution is still
 * KNOWN, and it is `redistributable` that decides whether the file may be copied.
 * DEC-018 requires `unknown` to stay distinct from a refusal, so it warns without
 * forbidding.
 */
export function buildSkillPrompt(skill: Skill, attribution: Attribution): string {
  const { name, description } = skill.declared
  const { state, basis, redistributable } = skill.rights

  const licence =
    state === 'known'
      ? redistributable
        ? `Licence: resolved. ${basis}. Redistribution is permitted.`
        : `Licence: resolved, and it does NOT permit redistribution. ${basis}. Do not copy this file into the project. Read it at the source and write your own implementation.`
      : `Licence: UNKNOWN. ${basis}. This is not the same as forbidden, but it is unverified. Check the repository before reusing the file.`

  return [
    `Use the "${name}" agent skill for this task.`,
    ``,
    description,
    ``,
    `Repository: ${attribution.repository}`,
    `Source: ${attribution.canonical_source_url}`,
    licence,
    ``,
    `Fetch SKILL.md from the source repository above and follow it. Do not assume the file is`,
    `redistributable unless the licence line says so.`,
  ].join('\n')
}
