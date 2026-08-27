import { OG_SIZE, renderOg } from '../og'

export const alt = 'Search agent skills on SkillAppMD'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return renderOg({
    eyebrow: 'Search',
    title: 'Search the SKILL.md index',
    note: 'Find a skill by name, description, or the repository it came from.',
  })
}
