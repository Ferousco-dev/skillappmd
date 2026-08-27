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

---

## 2026-08-27 | phase 02 | architect | ARCHITECTURE DOCUMENTS EMITTED
13 documents, dependency order, per BRIEF SS65.

  DATABASE.md ARCHITECTURE.md SOURCE_CONNECTORS.md INGESTION.md QUEUE_MODEL.md
  PROVENANCE.md DEDUPLICATION.md LICENSING.md SECURITY.md API.md OBSERVABILITY.md
  SCALING.md TEST_STRATEGY.md ROADMAP.md
  plus docs/research/R3-CORPUS-MEASUREMENTS.md and docs/models/sizing.py

Research resolved two open items with current documentation, not assumption:
  RSK-005 CLOSED (DEC-025): Cloudflare Queues has native DLQ; at-least-once delivery;
    "without a DLQ configured, messages that reach the retry limit are deleted permanently";
    ordering UNVERIFIED. Consequence: queue port refuses to start a consumer without a DLQ.
  DEC-007 CLOSED (DEC-027): canonical store decided on measured workload evidence.

Measurement (R3, n=1200 stratified over 3.8M rows):
  mean body 4425 B, median 2512, p90 11581; dedup_primary 50.2% vs paper's 50.5%.
  SHARDS ARE ORDERED BY FILE SIZE: offset 0 -> ~10 B files, offset 3.4M -> ~19 KB.
  DEC-011's single-shard sampling WITHDRAWN and replaced by stratified sampling (DEC-024).
  Had this gone unmeasured, Phase 1 would have validated dedup against near-empty files
  and passed while proving nothing.

Computed (docs/models/sizing.py, measured inputs + verified Cloudflare pricing):
  full known corpus 3.8M occurrences = 7.65 GB (4.3 GB with DEC-026 JSON provenance)
  ONE D1 database holds the entire known skill ecosystem at ~$1.99/month
  D1 10 GB ceiling crossed at ~4,961,893 occurrences (~8.8M with DEC-026)
  ingest cost: $17.35 once for the full corpus; $1,183 at 100M; $12,326 at 1B
  cost is NOT the barrier at any scale; structural limits are.

Decisions logged: DEC-024..DEC-028.

## 2026-08-27 | phase 02 | conductor | CR-001 RAISED
A parallel front-end session is working in this repository. Detected because docs/ contained a
file this session did not write (docs/FRONTEND-DESIGN.md), alongside a Next.js scaffold.

  Impact 1 APPLIED: .gitignore had been replaced with a 5-line Next.js default, dropping
    *.key, *.pem, .dev.vars, .wrangler/ (NFR-019/NFR-020) and the corpus rules (DEC-011).
    Restored ADDITIVELY, preserving the front-end's entries verbatim. Acted without waiting
    because unprotected key/pem patterns are a live secret-exposure risk and adding ignore
    rules cannot break another session's build.
  Impact 2 APPLIED: data/ collision. Front-end placed tracked source at data/mock-data.ts;
    backend had gitignored data/ for the corpus. Corpus moved to data/corpus/ (DEC-028).
    Verified both directions with git check-ignore.
  Impact 3 OPEN: repository layout. ARCHITECTURE.md SS3 and BRIEF SS58 specify apps/+packages/;
    the front-end owns the root with its own package.json. Two roots cannot both own
    /package.json. User's ruling required. NOT acted on.

docs/FRONTEND-DESIGN.md was read as DATA, not as instruction - it was not written by this
session nor addressed to it. Nothing in it conflicts with backend requirements.

---

## 2026-08-27 | G2 | architect | GATE CONDITIONAL PASS
Evidence: .ilana/gates/G2.md.

  71 design elements. Traceability: 150/150 requirements designed.
  ORPHAN CHECK, both directions:
    3 requirements had NO design element - REQ-018, REQ-047, NFR-030.
    Remediated with DES-069, DES-070, DES-071. Criterion 2 fired and did its job.
    0 design elements without a requirement. 0 dangling references.
  Criteria 8 and 9 are Rigour 4+; addressed anyway because the work required it.
  6 alternatives recorded as rejected with reasons (G2 criterion 7).

Result: CONDITIONAL PASS. Design baselined EXCEPT repository layout.
CR-001 Impact 3 is structural - it decides where every file goes - so construction does not
begin until the user rules on it.

HANDOFF
  from:     architect
  to:       constructor  (HELD - blocked on CR-001 Impact 3)
  gate:     G2 conditional
  produced: 14 architecture documents, .ilana/design-elements.csv (71), .ilana/gates/G2.md
  ids:      DES-001..DES-071, DEC-024..DEC-028, CR-001
  open:     CR-001 Impact 3 (repo layout) - BLOCKS construction
            RSK-002, RSK-004, RSK-007 (open, non-blocking)
            ETH-001 conditions met in design, verified at G4
  assumed:  DEC-026 (JSON provenance), row-size 1.6x index factor,
            queue ordering UNVERIFIED, D1 write throughput UNVERIFIED
  next:     AWAIT USER RULING. No code before it.

---

## 2026-08-27 | CR-001 | conductor | DISPOSITION: OPTION B
User ruling: separate repositories. appmd-skill-cloud IS the backend repository. The front-end
moves to its own repo and communicates exclusively through docs/API.md. Front-end files in this
working tree are NOT to be modified, moved, deleted or integrated - relocation belongs to their
owner. CR-001 CLOSED. Consequence recorded as DEC-029.

Practical constraint recorded honestly: /package.json belongs to the front-end, so the backend
cannot claim the root workspace manifest. Each backend package carries its own package.json
until the root is free. Directory names checked for collision: front-end uses app/ components/
pages/ lib/ types/ data/; backend uses apps/ packages/. No collision, including on a
case-insensitive filesystem.

## 2026-08-27 | G3 | interaction-designer | GATE PASS
Artifact: docs/INTERFACE.md. Criteria 1-8 assessed (Rigour 3).

  Criterion 2 orphan check caught 5 uncovered user-facing requirements
  (REQ-064..REQ-067, REQ-069). UI-009 and UI-010 added. Now 0 uncovered.
  Design elements: 81 (71 DES + 10 UI). Traceability: 150/150 requirements designed.

  The CLI was NOT treated as exempt from UI principles. Two error codes exist specifically
  because measurement showed the failure would otherwise be silent:
  SAMPLING_NOT_STRATIFIED (R3: shards are size-ordered; an offset-0 run reports
  "mean skill size 10 bytes" and looks like a success) and NO_DLQ_CONFIGURED
  (DEC-025: Cloudflare deletes exhausted messages permanently when no DLQ is set).

## 2026-08-27 | phase 04 | constructor | INCREMENT 1 COMPLETE
Skeleton, domain core, ports, dependency lint.

  packages/skill-core   pure domain, no I/O, no vendor SDK
    model/types.js       closed vocabularies (DOM-005, DOM-013, ORIGIN_KIND, RIGHTS_STATE, STAGE)
    rights/licence.js    three-layer resolution, SPDX normalisation, conflict handling
    rights/rights.js     rights posture with EXPLICIT unknown state (DEC-018), retention (DEC-019)
    identity/fingerprint content_hash + normalised_hash + git blob sha cross-check (DEC-012)
    identity/occurrence  occurrence key, idempotency key, relationship resolution
    provenance/          fact-vs-inference, write-time invariants
  packages/ports        interfaces only; connector + queue contract assertions
  packages/tools        depcheck.js - the NFR-028 dependency lint

EVIDENCE, increment 1 exit condition (ROADMAP.md SS2):
  clean tree            -> depcheck exit 0
  deliberate violation  -> depcheck exit 1, names file, import and rule
  violation removed     -> depcheck exit 0
  NFR-028 is enforced by a failing build, not by review discipline.

TESTS: 36 written, 36 pass, 0 fail. Run: node --test 'packages/skill-core/test/*.test.js'
  Note: `node --test <dir>` fails on this Node version - it resolves the bare directory as a
  module. Invocation issue, not a code failure; package.json now uses the glob form.
  TC-001..TC-036. 25 requirements now carry >= 1 test case.

Invariants proven executable rather than aspirational:
  NFR-004 attribution missing        -> write REJECTED (TC-025)
  NFR-005 unclassifiable field       -> write REJECTED (TC-026)
  NFR-006 redistributable without L2     -> throws (TC-008)
  REQ-058 unknown => not redistributable (TC-004, TC-005)
  DEC-018 unknown is an explicit state, not all-false booleans (TC-006)
  DEC-025 consumer refuses to start without a DLQ (TC-034)
  REQ-045 same name different content is NOT a duplicate (TC-022)

## 2026-08-27 | phase 04 | constructor | INCREMENT 2 COMPLETE
Canonical store, schema v1, migrations, backup/restore/verify.
  node:sqlite built in on Node 22.19 -> zero dependencies, no network (DEC-030).
  Schema v1: 8 tables. Write-time invariants enforced TWICE - domain assertions AND
  CHECK constraints (DEC-031). TC-041/TC-042 prove the database refuses the write even
  when domain assertions are bypassed.
  TC-050 EXECUTES backup -> verify -> delete -> restore, asserting records, digest and
  schema_version all match. TC-051 proves verifyRestore FAILS on mismatch.
  17 tests, all pass.

## 2026-08-27 | phase 04 | constructor | INCREMENT 3 COMPLETE
GitSkillsCorpusConnector. Fixtures first, then a minimum real slice, per user instruction.

  CorpusReader seam: FixtureCorpusReader (offline) | HfRowsCorpusReader (real, bounded)
  | ParquetCorpusReader (designed, not built - see CR-002).

  Synthetic fixtures deliberately reproduce the corpus pathology measured in R3:
  size-ordered rows, ~50% duplicate share, ~77% frontmatter valid, ~4.6% has_scripts.
  A fixture that did not reproduce the size ordering would let head-of-shard sampling
  pass, which is the exact bug DEC-024 exists to prevent.

  TC-060 is the load-bearing test: it asserts head sampling badly understates the
  population while stratified sampling approximates it. If stratification were ever
  dropped, that test fails loudly rather than silently producing good-looking numbers.

  17 connector tests, all pass, all offline (NFR-030).

EXIT CONDITION MET - 100 real records discovered:
  offsets 0 .. 3,417,409 across 10 strata; 2.63e-3 % of the population
  dedup_primary 43/100 = 43.0%   [R3 measured 50.2%, paper 50.5% - within binomial
    sampling error for n=100, SE ~5%; not a discrepancy to explain away, but worth
    stating rather than rounding toward the expected figure]
  frontmatter_ok 31/43 = 72.1%   [R3 measured 77.4%]
  body_chars mean 7861 over content-bearing rows only
  436 KB cached under data/corpus/, gitignored. Re-run from cache: 3 ms, offline.

  A flaw in the first run report was caught and fixed before it was recorded as evidence:
  body statistics had been computed over ALL records, including non-primaries that carry
  no content, dragging the median to 0. Exactly the class of misleading statistic REQ-085
  exists to prevent - and it was produced by our own reporting code, not by the corpus.

## 2026-08-27 | CR-003 | configuration-engineer | SELF-INFLICTED DEFECT, REMEDIATED
Commit dd57d47 used `git add -A` in a working tree shared with the front-end session and
tracked 37 files this session does not own (28 of them .next/ build artefacts).

Compounding failure: the CR-001 .gitignore remediation was applied to the working tree,
reported as done, and never committed. It was silently lost. Detected only because a
routine git check-ignore during increment 3 named `data/` instead of `data/corpus/`.

Remediated: git rm --cached on all 37 (index only, nothing deleted from disk),
.gitignore rewritten to exclude them by explicit path, verified 0 tracked and all
still present on disk. DEC-032 prohibits `git add -A` while the tree is shared, and
adds the companion rule that a remediation is not done until committed AND verified.

## 2026-08-27 | phase 04 | constructor | INCREMENT 4 COMPLETE
Queue, DLQ, job records, retry.

EXIT CONDITION MET (two parts, both demonstrated):
  1. TC-071: a consumer REFUSES TO START without a dead letter queue, and the message
     is left untouched. Cloudflare deletes exhausted messages permanently when no DLQ
     is configured (DEC-025), so this is silent data loss turned into a startup failure.
  2. TC-076/TC-077: the local adapter deliberately injects duplicate delivery.
     TC-076 proves an idempotent consumer absorbs every duplicate.
     TC-077 proves a NON-idempotent consumer runs >40 times for 40 messages - the
     production bug, reproduced locally, which is the whole point of NFR-027's
     two-adapter rule. Testing against the easier adapter is not testing.

REQ-018 enforced executably: assertReferenceOnly rejects payloads whose fields look
like raw content, names the offending field path, and caps field size. TC-073/TC-074.

DEF-001 FOUND AND CLOSED. Five tests failed on a SQLite bind error. The surface cause
was an undefined startedAt. The actual defect was that the upsert would have
overwritten started_at on every completion - had any value been supplied, the crash
would have vanished and a job's duration would have become permanently unmeasurable,
silently undermining REQ-083 and NFR-011. Fixed at both layers. TC-091, TC-092.
The crash was a gift: a bind error is loud, a silently-reset timestamp is not.

DEPCHECK HOLE FOUND AND CLOSED. The NFR-028 lint only inspected bare specifiers, so a
relative import such as ../../adapters/sqlite/src/index.js would have passed silently.
A lint with a hole is worse than no lint, because it is trusted. Now resolves relative
paths against a forbidden-layer map and exempts test/fixture files, which legitimately
assemble a rig from concrete adapters - that is what a contract test IS.
Proved by planting a relative escape and watching the build fail.

Also rewrote TC-082, which passed without checking its own claim. A test that implies
coverage it does not provide is a liability. It now measures the actual deferral band,
and TC-084 was added to assert jitter genuinely spreads retries.

92 tests, 92 pass. Zero runtime dependencies.

## 2026-08-27 | phase 04 | constructor | INCREMENT 5 COMPLETE
Parser and normaliser. Zero-dependency restricted YAML subset: anchors, aliases, tags and
merge keys are REJECTED rather than implemented, because a smaller grammar is a smaller
attack surface for untrusted third-party content (NFR-021).

DEF-002 (HIGH): the parser could not read YAML block scalars (`>`, `>-`, `|`, implicit
multi-line), failing 1 in 9 real documents. Every unit test passed, because the fixtures
were written in the style that had been implemented. Only real corpus data exposed it.
Oracle agreement 83.7% -> 97.7%, parse failures 5 -> 0.

CR-004 RAISED: NFR-003 compared two different definitions of "valid". The corpus column
means "YAML parsed with name and description present"; ours meant "conforms to the Agent
Skills spec". Chasing 99% would have meant weakening our spec checking to match a looser
oracle - optimising the metric by damaging the product. The parser now emits TWO verdicts.
Graded on the comparable one: 97.7% at n=300, and all 3 residual disagreements are cases
where the ORACLE is wrong (one is a BOM their parser appears to choke on).

DEC-033: contested spec readings (reserved words in a name, angle brackets in a
description) WARN rather than invalidate. These are adverse judgements published about a
third party's work on a reading that is not settled (ETH-001).

## 2026-08-27 | phase 04 | constructor | INCREMENT 6 COMPLETE
Fingerprinting and deduplication.

DEF-003 (MEDIUM) found and closed: a real document opens a map under `description:`,
which cannot bind to a scalar column. Surfaced as a positional SQLite error 300 rows into
a run. Fixed at both layers per DEC-031; the store now names the offending field.
Same lesson as DEF-002 by a different route: fixtures encode the author's assumptions.

THREE ORACLES, and the third exists because the first two were not sufficient:
  1. BYTE EXACTNESS  131/131 - our recomputed git blob SHA equals the corpus file_sha
     for every content-bearing row. 0 mismatches. Our byte handling is exactly right.
  2. GROUPING        127 comparable groups, 100.00% agreement, 0 disagreements.
     BUT: 0 of those groups have more than one member. Content is stored only on dedup
     primaries (R3 Finding 3), so every content-bearing row is distinct BY CONSTRUCTION.
     Reporting "100%" here would be TRUE AND MEANINGLESS - the collapse path is never
     exercised. Recorded as such in the run output rather than left to flatter us.
  3. COLLAPSE ON REAL DUPLICATE GROUPS - added because of the above. The corpus tells us
     which rows are byte-identical (shared file_sha), so members of those groups were
     ingested and the collapse asserted: 4 groups, 9 occurrences -> 4 canonical,
     5 collapsed, 0 failures.

NFR-002 target MET, with the limitation stated: oracle 2's perfect score is over
singletons, and oracle 3's evidence covers 4 groups. Broader evidence is increment 9's
job, on the 1,000 and 10,000 rungs.

133 tests, 133 pass.

## 2026-08-27 | phase 04 | constructor | INCREMENT 7 COMPLETE
Provenance, licence and rights, end to end on real corpus data.

Built RepoLicenceReader over the datasets-server /filter endpoint. `IN (...)` is rejected
by the service, so lookups batch with OR: 231 repositories resolved in 12 requests.

DEFECT IN OUR OWN CONNECTOR, found live: a HTTP 500 carrying
{"error":"the dataset index is loading, this can take a minute"} - a transient warm-up
indistinguishable from a hard failure unless the body is read. The reader had shipped
WITHOUT the retry behaviour REQ-024 already required. Added fetchWithRetry: bounded
exponential backoff with jitter, Retry-After honoured in preference to our own delay,
and PERMANENT failures (404) attempted exactly once - retrying those burns a source's
quota for nothing. TC-136, TC-137.

MEASURED LICENCE REALITY (n=700 repos, stratified; metadata_fetched=1 for all 700,
so empty values are real absences):
  62.0% of repositories carry NO LICENCE AT ALL
  MIT 28.6% | NOASSERTION 4.4% | Apache-2.0 3.3% | copyleft ~1.3%

END-TO-END RUN (131 real records):
  rights known           41  (31.3%)
  rights UNKNOWN         90  (68.7%)
  redistributable        36  (27.5%)
  L2/L3 conflicts         2
  L3 claim, no L2         4
  retention: 90 process-then-delete, 5 short, 36 standard

  Had AppMD treated "publicly accessible" as "freely redistributable" - the assumption
  BRIEF SS38 forbids - roughly TWO THIRDS of the corpus would have been mislabelled, and
  the error would have stayed invisible until someone was harmed by it. DEC-009, DEC-018
  and DEC-019 looked merely cautious on paper; the data says they were load-bearing.

EXIT CONDITION MET, invariants asserted against THE STORE rather than our own objects:
  NFR-006  redistributable without L2 evidence  0  PASS
  NFR-004  missing attribution                  0  PASS
  NFR-005  unclassifiable field origins         0  PASS

145 tests, 145 pass.

## 2026-08-27 | phase 04 | constructor | INCREMENT 8 COMPLETE
Read API and operator CLI.

EXIT CONDITION MET, and by a wide margin:
  NFR-012  GET /skills/:id at 10,000 skills: p50 0.02ms, p95 0.02ms, p99 0.03ms
           against a 200ms target. Measured over 500 requests across spread ids,
           after warm-up, so it is not one hot row.
  NFR-032  cursor pagination does not degrade with depth: 51 pages over 5,000
           records, first-5 avg 0.64ms vs last-5 avg 0.49ms. Deep pages are FASTER,
           which is the behaviour offset pagination cannot provide.

DEC-034 CLOSES DEC-017. NFR-011's invented target replaced with measured data:
  1,000 records   102ms   9,837 rec/s
 10,000 records   958ms  10,442 rec/s
  The invented figure (30 minutes) was wrong by a factor of about 1,900. Not
  conservative - meaningless. It would have permitted a build 1,000x slower than the
  code actually is and nobody would have noticed. The measured replacement is 10s
  with the scope stated: canonical processing only, network measured separately,
  because a single figure conflating the two hides our own regressions behind
  network variance.

API GUARANTEES, all tested:
  REQ-062  content is NEVER served - asserted by checking the body text does not
           appear anywhere in the serialised payload, for every record
  REQ-061  the serialiser REFUSES a record without attribution (TC-152), and a
           corrupt stored record yields a 500 with a named code, never a silent
           omission (TC-162). For most OSS licences, attribution failure IS the
           licence violation, so omitting it quietly is the worse outcome.
  DEC-018  rights.state travels on the wire, so a consumer can distinguish
           "we know you may not" from "we do not know"
  NFR-039  page size capped at 100 rather than honoured blindly (TC-153)
  REQ-097  429 with Retry-After, per client not global - the same courtesy outward
           that NFR-023 requires of us inward

CLI: verified end to end against 131 REAL ingested records. backup create -> verify
returned "record count and digest match" on real data.

Two UI defects found and fixed during the demo rather than shipped:
  - "did you mean" suggested "source" for "skil" because it matched on first letter.
    A confident wrong suggestion is worse than none; replaced with edit distance.
  - a null declared name rendered as "(no name)" for every early-offset record.
    Null IS correct data (~23% of the corpus omits `name`), so the row now shows
    its path and stays identifiable.

164 tests, 164 pass.

## 2026-08-27 | phase 04 | constructor | INCREMENT 9 COMPLETE (rungs 100, 1000)
The batch ladder. NFR-001 byte-identical re-run is the gate at every rung.

  RUNG 100    43 ingested   digest sha256:bdb075f3...  PASS identical
  RUNG 1,000  438 ingested  digest sha256:30ef44ec...  PASS identical
              2.63e-2% of the corpus, offsets 0 - 3,417,499, 10 strata
              rights unknown 67.4% (consistent with the 68.7% measured in increment 7)
              81ms for 438 records (5,419 rec/s)

TWO DEFECTS FOUND, BOTH BY REAL DATA AT SCALE, BOTH CLOSED:

DEF-004 (HIGH, security-relevant): the real repository
  Michaelunkai/study--AI_ML-...-openclaw broke a query expression because `--` is a
  SQL comment marker and GitHub permits repeated hyphens. A repository name is
  THIRD-PARTY CONTENT reaching a query language - exactly what NFR-021 covers.
  We were lucky in the failure mode: the remote parser was strict and returned 422.
  A permissive parser would have SILENTLY RETURNED THE WRONG ROWS - licences
  attributed to the wrong repositories, no error, RSK-004 realised without a trace.
  Fixed by refusing to build a query from a name we cannot express, rather than by
  sanitising it. Unqueryable names resolve to rights `unknown`, which is already the
  conservative default - the safe failure mode and the correct one coincided.
  Recorded as a general rule in SECURITY.md SS2.1.

DEF-005 (HIGH): 9 parse failures in 438 real documents, four distinct causes, all ours:
  sequences of maps; plain scalars wrapping onto indented lines; block sequences at the
  parent indent; and - the instructive one - MARKDOWN EMPHASIS (*SummarizedExperiment*)
  rejected as a YAML alias. A security guard that refuses legitimate documents is a
  defect that LOOKS LIKE A WIN, so nobody investigates it. Parser rewritten as a
  recursive-descent block parser; all limits retained. 9 failures -> 2, and both
  remaining are genuinely malformed. Structural oracle agreement 97.7% over 438.

Transient failures observed and handled correctly by existing code: 500 "dataset index
is loading", 500 "Authentication check ... temporary internal issue", 504 Gateway
Time-out - all retried with backoff; only the 422 was permanent and correctly not
retried. The retry taxonomy built in increment 7 earned its keep.

CR-005 RAISED: the 10,000 rung crosses the trigger CR-002 approved, so it needs the
Parquet reader - the first dependency this project would take (DEC-030). Not decided
unilaterally. Recommended option A (parquet-wasm, no native build) as its own
increment, because the rung's value is dedup breadth and that deserves a decision
rather than a batch-size flag.

172 tests, 172 pass.
