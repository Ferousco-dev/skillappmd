'use client'

export default function SkillsLanding() {
  const bars = [
    { height: '54%', left: '0%', delay: '0ms' },
    { height: '78%', left: '23%', delay: '60ms' },
    { height: '92%', left: '46%', delay: '120ms' },
    { height: '68%', left: '69%', delay: '180ms' },
    { height: '40%', left: '92%', delay: '240ms' },
  ]

  return (
    <main className="skills-page">
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand-mark" href="/" aria-label="AppMD home">
          <svg viewBox="0 0 44 44" role="img" aria-label="AppMD mark">
            <rect x="1.5" y="1.5" width="18" height="18" />
            <rect x="24.5" y="1.5" width="18" height="14" />
            <rect x="1.5" y="24.5" width="14" height="18" />
            <rect x="20.5" y="20.5" width="22" height="22" />
          </svg>
        </a>
        <a className="document-button" href="/about">Document</a>
      </nav>

      <section className="hero" aria-labelledby="skills-heading">
        <div className="hero-copy">
          <h1 id="skills-heading">Skills</h1>
          <div className="terminal" aria-label="Command line example">
            <code>npx <span className="terminal-dots">...</span><span className="cursor" aria-hidden="true" /></code>
          </div>
        </div>

        <div className="bar-cluster" aria-hidden="true">
          {bars.map((bar, index) => (
            <span
              className="bar"
              key={index}
              style={{ height: bar.height, left: bar.left, animationDelay: bar.delay }}
            />
          ))}
        </div>
      </section>

      <footer className="footer">
        <a href="#privacy">Privacy</a>, <a href="#cookies">cookies</a>, <a href="mailto:contact@appmd.dev">contact</a>
      </footer>

      <style jsx global>{`
        :root {
          --paper: #f7f6f2;
          --ink: #111116;
          --purple: #6366f1;
          --muted: rgba(17, 17, 22, 0.58);
          --line: rgba(17, 17, 22, 0.28);
        }

        * { box-sizing: border-box; }
        html, body { min-height: 100%; }
        body {
          margin: 0;
          background: var(--paper);
          color: var(--ink);
          font-family: Arial, Helvetica, sans-serif;
        }
        a { color: inherit; }

        .skills-page {
          position: relative;
          min-height: 100svh;
          overflow: hidden;
          padding: clamp(28px, 6.2vh, 64px) clamp(24px, 7.1vw, 108px) clamp(28px, 5vh, 54px);
          isolation: isolate;
        }
        .topbar {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }
        .brand-mark {
          display: block;
          width: 44px;
          height: 44px;
          color: var(--ink);
          transition: color 180ms ease, transform 180ms ease;
        }
        .brand-mark:hover { color: var(--purple); transform: translateY(-1px); }
        .brand-mark svg { display: block; width: 100%; height: 100%; }
        .brand-mark rect {
          fill: none;
          stroke: currentColor;
          stroke-width: 1.35;
          vector-effect: non-scaling-stroke;
        }
        .document-button {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          border: 1px solid var(--ink);
          border-radius: 999px;
          padding: 0 21px;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.01em;
          text-decoration: none;
          transition: background-color 180ms ease, color 180ms ease, transform 180ms ease;
        }
        .document-button:hover,
        .document-button:focus-visible {
          background: var(--ink);
          color: var(--paper);
          transform: translateY(-1px);
        }
        .document-button:focus-visible,
        .brand-mark:focus-visible,
        .footer a:focus-visible { outline: 2px solid var(--purple); outline-offset: 5px; }

        .hero {
          position: absolute;
          top: 39%;
          left: 50%;
          width: min(100% - 48px, 900px);
          transform: translate(-50%, -50%);
        }
        .hero-copy {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        h1 {
          margin: 0;
          font-size: clamp(76px, 14.6vw, 218px);
          font-weight: 700;
          letter-spacing: -0.085em;
          line-height: 0.84;
        }
        .terminal {
          display: flex;
          width: clamp(280px, 39vw, 570px);
          height: clamp(62px, 7.2vw, 82px);
          align-items: center;
          margin-top: clamp(30px, 4.2vh, 48px);
          border: 1px solid var(--line);
          padding: 0 clamp(21px, 2.1vw, 32px);
          background: rgba(255, 255, 255, 0.12);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.55), 3px 4px 0 rgba(17,17,22,0.05);
        }
        .terminal code {
          display: flex;
          align-items: center;
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
          font-size: clamp(16px, 1.55vw, 22px);
          letter-spacing: 0.01em;
        }
        .terminal-dots { letter-spacing: 0.16em; color: var(--muted); }
        .cursor {
          width: 1px;
          height: 1.15em;
          margin-left: 5px;
          background: var(--purple);
          animation: blink 1.1s steps(2, start) infinite;
        }
        .bar-cluster {
          position: absolute;
          top: 35%;
          right: clamp(-110px, -7vw, -40px);
          width: clamp(100px, 13vw, 190px);
          height: 220px;
          transform: translateY(-50%);
        }
        .bar {
          position: absolute;
          bottom: 0;
          width: 1px;
          background: var(--purple);
          opacity: 0;
          transform-origin: bottom;
          animation: rise 550ms cubic-bezier(.22,.8,.26,1) forwards;
        }
        .footer {
          position: absolute;
          left: clamp(24px, 7.1vw, 108px);
          bottom: clamp(28px, 5vh, 54px);
          color: var(--muted);
          font-size: 12px;
          letter-spacing: 0.01em;
        }
        .footer a { text-decoration: none; transition: color 160ms ease; }
        .footer a:hover { color: var(--purple); }

        @keyframes blink { 50% { opacity: 0; } }
        @keyframes rise { from { opacity: 0; transform: scaleY(0.2); } to { opacity: 0.72; transform: scaleY(1); } }
        @media (max-width: 640px) {
          .skills-page { padding-left: 24px; padding-right: 24px; }
          .hero { top: 42%; width: calc(100% - 48px); }
          h1 { font-size: clamp(76px, 26vw, 150px); }
          .terminal { width: min(100%, 380px); margin-top: 28px; }
          .bar-cluster { top: 105%; right: -10px; width: 92px; height: 112px; }
          .footer { left: 24px; right: auto; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
        }
      `}</style>
    </main>
  )
}
