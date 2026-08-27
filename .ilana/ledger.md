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

---

## 2026-08-27 | phase 01 | architect | RESEARCH ADDENDUM
Artifact: docs/research/R2-GITSKILLS-CORPUS.md.
Method: Hugging Face datasets-server API only. Nothing downloaded.

  - Parquet mirror is 13.4 GB across 78 files in 4 tables, NOT 44.4 GB (that is Zenodo SQLite).
    artifacts 31 files/6.45 GB; artifact_siblings 45/6.96 GB; repos 1/0.02 GB; mining_runs 1.
  - Full column schema recovered for all four tables (R2 §2).
  - artifacts.content carries full SKILL.md text -> Phase 1 corpus path needs no GitHub fetch.
  - artifacts.dedup_primary is a row-level dedup verdict -> precision/recall oracle, not just
    the paper's aggregate 50.5% figure.
  - artifacts.frontmatter_valid is a parser oracle.
  - repos.license supplies L2 licence for all 282,200 repositories.
  - Commit authors already anonymised, messages redacted by the dataset authors.

Phase 1 subset fixed at repos (0.02 GB) + one artifacts shard (~208 MB) = ~0.5% of the SQLite
archive. artifact_siblings not pulled in Phase 1.

Decisions logged: DEC-009..DEC-014 (user decisions 1-4 + corpus strategy + identity authority).

---

## 2026-08-27 | phase 01 | analyst | SRS EMITTED
Artifact: docs/SRS.md (519 lines, IEEE 830 shape). Traceability: .ilana/traceability.csv.

  90 functional (REQ-001..REQ-090), of which 80 are priority M for Phase 1
  34 non-functional (NFR-001..NFR-034)
  12 domain (DOM-001..DOM-012)
  136 traceability rows, generated from the SRS by script, not transcribed by hand.

Also emitted: docs/correspondence/DRAFT-skillsmp-clarification.md (NOT SENT, per instruction).

---

## 2026-08-27 | G1 | analyst | GATE CONDITIONAL PASS
Evidence: .ilana/gates/G1.md. Criteria 1-9 assessed (Rigour 3).

  Criterion 3 FOUND A REAL DEFECT: REQ-015 contained "independently scalable", an unmeasurable
  adjective. Rewritten to "worker concurrency is configurable per stage, such that changing one
  stage's concurrency requires no change to any other stage's configuration or code."
  This is the adjective test doing its job; recording it rather than quietly fixing it.

  Criterion 6 PASS WITH DECLARED DEVIATION: 14 of 34 NFRs carry number+unit; 20 are binary
  predicates with a stated verification procedure. Declared, not glossed.

  Criterion 8: two genuine requirement conflicts found and dispositioned as DEC-015 (raw
  immutability vs deletability -> tombstone: bytes deletable, provenance envelope permanent)
  and DEC-016 (208 MB shard vs 128 MB worker ceiling -> row-group streaming).

  Criterion 7 NOT MET: stakeholder has not reviewed the SRS. The analyst wrote it and cannot
  validate it; that check would be circular. G1 does not close until the user reviews.

Decision: phase 02 architecture MAY proceed. No requirement is baselined and NO construction
begins until criterion 7 is met.

HANDOFF
  from:     analyst
  to:       architect
  gate:     G1 (conditional) -> attempting G2
  produced: docs/SRS.md, .ilana/traceability.csv, .ilana/gates/G1.md,
            docs/research/R2-GITSKILLS-CORPUS.md, docs/correspondence/DRAFT-skillsmp-clarification.md
  ids:      REQ-001..REQ-090, NFR-001..NFR-034, DOM-001..DOM-012, DEC-009..DEC-016
  open:     G1 criterion 7 (stakeholder review) - BLOCKS baseline
            RSK-005 Queues DLQ UNVERIFIED - BLOCKS G2 close (REQ-020, REQ-023)
            ETH-001 trust-score conditions - BLOCKS G2 close (REQ-076..079)
            DEC-007 canonical store undecided - resolved by docs/DATABASE.md
            RSK-002 SkillsMP robots/API - draft letter ready, unsent
  assumed:  DEC-004, DEC-007, DEC-013 remain ASSUMPTION.
  next:     ARCHITECTURE.md, DATABASE.md, SOURCE_CONNECTORS.md, INGESTION.md, DEDUPLICATION.md,
            PROVENANCE.md, SECURITY.md, SCALING.md, API.md, ROADMAP.md; then G2.

---

## 2026-08-27 | phase 01 | analyst | STAKEHOLDER REVIEW DELIVERED
Review across 10 dimensions requested by the user: promises, Phase 1 content, architecturally
load-bearing requirements, invented assumptions, Cloudflare cost drivers, legal exposure,
1M+ bottlenecks, migration risk, over-engineering, gaps.

Analyst self-disclosures of note:
  - 13 invented numbers/choices listed explicitly, including NFR-011 as a pure guess.
  - Departure from BRIEF §38 disclosed: `Unknown` rights state had been replaced by all-false
    booleans and `cacheable` added.
  - Largest cost driver identified: 9 queue messages per occurrence (>=9M at 1M skills).
  - Largest legal exposure identified: unconditional raw retention of unknown-licence content.
  - Runtime finding: Parquet reading is unlikely to run inside a Worker; deployment is two
    runtimes, not one.
  - 8 gaps identified, incl. missing canonical backup (contradicting BRIEF §62) and missing
    personal-data handling for identifiable repo owners.

## 2026-08-27 | phase 01 | analyst | SRS v1.1 EMITTED
User returned 18 numbered decisions. All applied. Artifact: docs/SRS.md v1.1 (620 lines).

  Modified 10: DOM-008, REQ-005, REQ-025, REQ-029, REQ-034, REQ-063, REQ-067, NFR-002,
               NFR-010, NFR-011
  Added   14: DOM-013, REQ-091..REQ-098, NFR-035..NFR-039
  Added structurally: SS7.1 governing principle; schema_version, identity_class, rights.state,
               retention block in the canonical schema.

  Counts: 98 REQ (87 M, 6 S, 5 F), 39 NFR, 13 DOM. 150 traceability rows.
  ID integrity verified by script: REQ 1..98, NFR 1..39, DOM 1..13, no gaps, no duplicates.

  Two analyst choices were REVERSED by the stakeholder: DEC-018 (rights `unknown` restored as an
  explicit state) and DEC-019 (raw retention made rights-aware and non-permanent by default).
  Both reversals were correct and both are recorded as such.

Decisions logged: DEC-017..DEC-023.

---

## 2026-08-27 | G1 | analyst | GATE PASS (attempt 2)
Evidence: .ilana/gates/G1.md. Supersedes the attempt-1 CONDITIONAL PASS.

  Criterion 3 FOUND A SECOND REAL DEFECT: REQ-097 contained "simple configurable abstraction",
  introduced in this very revision. Rewritten to observable behaviour (per-client budget,
  configurable window, HTTP 429 + Retry-After). Re-run: 0 hits in requirement rows.
  Two revisions, two adjective-test catches. The check earns its place.

  Criterion 6 remains PASS WITH DECLARED DEVIATION: 13 of 39 NFRs carry number+unit; the rest
  are binary predicates with stated verification procedures. Declared, not glossed.

  Criterion 7 NOW MET: stakeholder reviewed and returned 18 decisions, two of which reversed
  analyst choices. That is what independent validation is supposed to look like.

Decision: SRS v1.1 BASELINED. Further change requires CR-###.
Phase 02 NOT started - user instruction: stop and await approval.

HANDOFF
  from:     analyst
  to:       architect  (HELD - not yet handed off, awaiting user approval)
  gate:     G1 PASS
  produced: docs/SRS.md v1.1, .ilana/traceability.csv (150 rows), .ilana/gates/G1.md
  ids:      REQ-001..098, NFR-001..039, DOM-001..013, DEC-001..023
  open:     RSK-002 (SkillsMP robots/API - letter drafted, unsent)
            RSK-004 (three-layer licence exposure - reduced by DEC-019, not closed)
            RSK-005 (Queues DLQ UNVERIFIED) - BLOCKS G2
            RSK-007 / ETH-001 (trust-score conditions) - BLOCKS G2
            DEC-007 (canonical store undecided) - resolved by docs/DATABASE.md
  assumed:  DEC-004, DEC-007, DEC-013 remain ASSUMPTION. NFR-011 provisional per DEC-017.
  next:     AWAIT USER APPROVAL before phase 02.
