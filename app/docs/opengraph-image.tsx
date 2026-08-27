import { OG_SIZE, renderOg } from '../og'

export const alt = 'SkillAppMD documentation'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return renderOg({
    eyebrow: 'Documentation',
    title: 'How SkillAppMD works',
    note: 'Install, resolve, fetch from origin. SkillAppMD never serves skill content.',
  })
}
