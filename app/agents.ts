/**
 * Agents whose logos appear in the hero. Files live in /public/logos.
 *
 * `darkFile` exists only for marks that are near-black and would disappear
 * against a dark surface. The rest are coloured and read on both themes.
 */
export type Agent = { name: string; file: string; darkFile?: string }

export const agents: Agent[] = [
  { name: 'Claude', file: 'claude' },
  { name: 'Cursor', file: 'cursor', darkFile: 'cursor-dark' },
  { name: 'Gemini', file: 'gemini' },
  { name: 'Codex', file: 'openai', darkFile: 'openai-dark' },
  { name: 'Replit', file: 'replit' },
  { name: 'Grok', file: 'grok', darkFile: 'grok-dark' },
  { name: 'Windsurf', file: 'windsurf', darkFile: 'windsurf-dark' },
  { name: 'Perplexity', file: 'perplexity' },
]

export const logoSrc = (agent: Agent, dark: boolean) =>
  `/logos/${dark && agent.darkFile ? agent.darkFile : agent.file}.svg`

export const agentImagesFor = (dark: boolean) =>
  agents.map(agent => ({ src: logoSrc(agent, dark), alt: agent.name }))
