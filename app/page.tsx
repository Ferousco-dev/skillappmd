import AgentsBadge from './components/AgentsBadge'
import CursorStyles from './components/CursorStyles'
import PointerState from './components/PointerState'
import BrandLink from './components/BrandLink'
import HeroStage from './components/HeroStage'
import DocumentationButton from './components/DocumentationButton'
import ThemeToggle from './components/ThemeToggle'
import { Logo } from './components/Logo'
import HeaderSearch from './components/HeaderSearch'
import Hangers from './components/Hangers'
import SearchPanel from './components/SearchPanel'
import Guide from './components/Guide'
import SplitFlapText from './components/SplitFlapText'
import StepCluster from './components/StepCluster'

export default function Page() {
  return (
    <div className="landing">
      <CursorStyles />
      <PointerState />

      {/* Fixed, so it stays crisp and in place while the hero dissolves. */}
      <header className="page-header">
        <BrandLink />

        <div className="header-actions">
          <HeaderSearch />
          <ThemeToggle />
          <DocumentationButton />
        </div>
      </header>

      <HeroStage>
        <section className="hero">
          <h1 className="visually-hidden">Skills</h1>

          <div className="hero-head">
            <AgentsBadge />

            <SplitFlapText
              words={['SKILLS', 'AGENTS', 'PROMPTS']}
              padTo={7}
              fontSize="clamp(28px, 6vw, 72px)"
              gap={8}
              tileRadius={10}
              tileColor="var(--flap-tile)"
              textColor="var(--flap-text)"
              flipDuration={0.1}
              stagger={0.05}
              cycleDelay={2600}
              aria-hidden="true"
            />
          </div>

          <SearchPanel />
        </section>

        <footer className="page-footer">
        <a href="/privacy">Privacy</a>
        <span aria-hidden="true">,</span>
        <a href="/contact">Contact</a>
      </footer>

        <Hangers />
        <StepCluster />
      </HeroStage>

      <Guide />

    </div>
  )
}
