'use client'

import { ImagesBadge } from '@/components/ui/images-badge'
import { agents, agentImagesFor } from '../agents'
import { useTheme } from './useTheme'

/** Picks the logo variant that stays legible on the active theme. */
export default function AgentsBadge() {
  const dark = useTheme() === 'dark'

  return (
    <ImagesBadge
      images={agentImagesFor(dark)}
      size="sm"
      shape="rounded"
      label={`Works with ${agents.length} coding agents`}
      imageClassName="p-1.5"
    />
  )
}
