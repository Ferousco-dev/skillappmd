# ÌLÀNÀ LEDGER — appmd-skill-cloud

Append-only. Newest at the bottom. Entries are never edited, only superseded.

---

## 2026-08-27 | G0 | conductor | INTAKE COMPLETE
Project: skill.appmd.dev — AI Skill Intelligence infrastructure.
Registers set: MODE=FLEET (role rotation, no sub-agents), RIGOUR=3, PROCESS_STYLE=hybrid.
User confirmed all three explicitly at intake Q10.

Scope: whole backend/infrastructure. Single session, single owner, solo developer.
Deferred with reason (not gaps): frontend, marketplace, user accounts, recommendation learning.
No deadline. "Cheap by construction" is a hard architectural principle, not a preference.

Evidence: intake answers 1-16 supplied in full; both mandatory ethics questions answered.
Harm model confirmed by user: mis-attribution, licence-violating redistribution, authors losing
control, misleading metadata downstream, compromised skills installed on AppMD's say-so,
incorrect high trust scores, source providers abused by aggressive crawling.

---

## 2026-08-27 | G0 | architect + ethics-officer | RESEARCH COMPLETE
Artifact: docs/research/R1-SOURCE-ACCESS-MODEL.md (392 lines).
Network research authorised by user at intake Q2. All primary sources fetched directly this
date; second-hand claims labelled UNVERIFIED per Article 2.

Findings that changed the plan:
  - SkillsMP hosts no content. It indexes SKILL.md files in public GitHub repos.
  - SkillsMP ToS: "You may not scrape or systematically download large portions of the website."
  - No bulk export. REST = 500 req/day x 50 results, keyword-only, capped result window.
    MCP = no daily quota but keyword-driven, max 2,500 results per distinct query.
  - Sitemaps expose 13,162 of a claimed 2,000,000 skills (~0.65%) — a deliberate sample.
    Measured: skills-popular 11,452 locs; repositories-discovered 4,459; skills-discovered 1,710.
  - GitHub code search: 10 req/min, 1,000 results/query hard cap.
  - GitSkills (Zenodo 10.5281/zenodo.21875637, CC-BY-4.0): 3,797,117 SKILL.md occurrences,
    282,200 repos, 1,877,981 distinct contents, 50.5% verbatim copies, hashes + parsed
    frontmatter precomputed.
  - SKILL.md spec: only `name` and `description` are required; runtimes ignore unknown keys.
  - Cloudflare verified ceilings: D1 10 GB/database; Queues 128 KB message, 5,000 msg/s;
    Workers 6 simultaneous outgoing connections, 128 MB, free tier unusable for ingestion;
    Vectorize 20M vectors/index, 1,536 dimensions max, topK <= 50 with metadata.

Decisions logged: DEC-001..DEC-008. Risks logged: RSK-001..RSK-008. Ethics: ETH-001, ETH-002.

Consequence: the brief's premise that SkillsMP is the initial primary *content* source does not
survive contact with its terms of service. Re-scoped under DEC-002 to seed/signal, with GitHub
as content origin and GitSkills as the Phase 1 corpus (DEC-003). Brief sections 12 and 66
anticipated this; the re-scope satisfies them rather than departing from them.

Open items carried into phase 01: RSK-002, RSK-004, RSK-005, RSK-007, ETH-001.

HANDOFF
  from:     architect
  to:       analyst
  gate:     G0 -> attempting G1
  produced: docs/research/R1-SOURCE-ACCESS-MODEL.md, .ilana/{decisions,risks,ethics}.md
  ids:      DEC-001..DEC-008, RSK-001..RSK-008, ETH-001..ETH-002
  open:     RSK-002 (robots/API interpretation, needs written clarification from SkillsMP)
            RSK-004 (three-layer licence exposure)
            RSK-005 (Queues DLQ support UNVERIFIED — must resolve before G2 closes)
            RSK-007 / ETH-001 (trust-score publication conditions — BLOCKING at G2)
  assumed:  DEC-004 robots.txt governs crawlers, not invited keyed API clients. UNCONFIRMED.
            DEC-007 Cloudflare runtime; canonical store deliberately undecided until G2.
  next:     elicit and specify requirements; every one testable; no code before G1.
