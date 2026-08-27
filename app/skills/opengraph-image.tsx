import { OG_SIZE, renderOg } from '../og'

export const alt = 'The SkillAppMD skill index'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return renderOg({
    eyebrow: 'Index',
    title: 'Every indexed SKILL.md',
    note: 'With the repository it came from and what is known about its licence.',
  })
}
