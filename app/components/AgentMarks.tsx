'use client'

import { agents, logoSrc } from '../agents'
import { useTheme } from './useTheme'

/**
 * Flat row of agent marks.
 *
 * Replaces the hanging threads from the first landing. Same information, far
 * less furniture, and it sits inside the page grid instead of floating over it.
 */
export default function AgentMarks() {
  const dark = useTheme() === 'dark'

  return (
    <ul className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-5">
      {agents.map(agent => (
        <li key={agent.name} className="flex items-center">
          <img
            src={logoSrc(agent, dark)}
            alt={agent.name}
            title={agent.name}
            width={22}
            height={22}
            className="h-[22px] w-[22px] object-contain opacity-70 transition-opacity hover:opacity-100"
            loading="lazy"
          />
        </li>
      ))}
    </ul>
  )
}
