import { OG_SIZE, renderOg } from './og'

export const alt = 'SkillAppMD, a resolver for agent skills'
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
  return renderOg({
    eyebrow: 'Agent skills',
    title: 'A resolver for agent skills',
    note: 'Install once. Your agent finds the skill it needs, with the licence position attached.',
  })
}
