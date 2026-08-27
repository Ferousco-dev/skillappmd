import { OCCURRENCE_COUNT, REPOSITORY_COUNT } from '../corpus'
import InstallCommand from './InstallCommand'

const occurrences = OCCURRENCE_COUNT.toLocaleString('en-US')
const repositories = REPOSITORY_COUNT.toLocaleString('en-US')

export default function SearchPanel() {
  return (
    <div className="search-panel">
      <p className="collected">
        <span className="collected-dot" aria-hidden="true" />
        <span className="collected-count">{occurrences}</span>
        <span className="collected-label">
          SKILL.md occurrences across {repositories} repositories
        </span>
      </p>

      {/* The install command replaces the hero search. SkillAppMD ships as one
          skill: install it once, and the agent asks SkillAppMD what it needs. */}
      <InstallCommand />

      <p className="install-note">
        Install once into Claude Code, Cursor, Codex or any agent that loads SKILL.md. It resolves
        the right skill for the task instead of pulling the whole index.
      </p>

    </div>
  )
}
