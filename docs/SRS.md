# SOFTWARE REQUIREMENTS SPECIFICATION
## AppMD Skill Intelligence Cloud — `skill.appmd.dev`

| | |
| --- | --- |
| Document | SRS **v1.1** |
| Date | 2026-08-27 |
| Owner | `[analyst]` (single writer; Ìlànà kernel §4) |
| Shape | IEEE 830 |
| Rigour | 3 — gates enforce, overrides logged |
| Status | **Submitted for G1, attempt 2** |
| Supersedes | SRS v1.0 (2026-08-27) — see §10 Change log |

---

## 1. INTRODUCTION

### 1.1 Purpose

This document specifies the requirements for **Phase 1** of the AppMD Skill Intelligence Cloud,
and states the requirements of later phases at a level sufficient to prove that the Phase 1
architecture does not foreclose them.

Phase 1's objective, in the user's own framing, is the standard against which this SRS is written:

> **Phase 1 is not "build the billion-skill system." Phase 1 is proving that AppMD can
> reliably transform a real-world skill corpus into a canonical, provenance-preserving,
> deduplicated skill index. Correctness first. Scale second.**

Every requirement below is testable. Per Constitution Article 4, any requirement admitting two
readings is a defect; where a genuine ambiguity survives, it is recorded as a `DEC-###`
assumption rather than resolved silently.

### 1.2 Scope

**In scope for Phase 1:**

```
Source → Discovery → Queue → Fetch → Parse → Normalize
       → Fingerprint → Deduplicate → Canonical Storage → Read API
```

**Explicitly out of scope for Phase 1** (deferred with reason, not gaps — `DEC-008`):
frontend, dashboards, marketplace, user accounts, payments, recommendation learning,
skill composition, master skills, the skill compiler, agent-specific packaging.

**Out of scope for Phase 1 but architecturally provided for** (§4.10): AI understanding,
capability engine, skill graph, semantic search, resolution, security analysis.

### 1.3 Definitions

| Term | Meaning in this document |
| --- | --- |
| **Skill** | A folder containing a `SKILL.md` file with agent instructions, optionally with scripts and reference files. |
| **Artifact occurrence** | One `SKILL.md` file at one path in one repository. Not an identity. |
| **Canonical Skill** | AppMD's resolved identity for a skill, to which one or more occurrences map. |
| **Source fact** | Information asserted by an external source. |
| **AppMD inference** | Information AppMD derived. Never interchangeable with a source fact (brief §12). |
| **Provenance** | The traceable origin of a single field value, including which of the above it is. |
| **Rights posture** | Computed permissions: `indexable` / `linkable` / `cacheable` / `redistributable`. |
| **Corpus** | A bulk dataset source. Phase 1's is GitSkills (CC-BY-4.0). |
| **Connector** | An implementation of the `SourceConnector` contract for one external source. |

### 1.4 References

| Ref | Document |
| --- | --- |
| BRIEF | AppMD Skill Intelligence Cloud brief, §1–§68 |
| R1 | `docs/research/R1-SOURCE-ACCESS-MODEL.md` |
| R2 | `docs/research/R2-GITSKILLS-CORPUS.md` |
| DEC | `.ilana/decisions.md`, `DEC-001`..`DEC-014` |
| RSK | `.ilana/risks.md`, `RSK-001`..`RSK-008` |
| ETH | `.ilana/ethics.md`, `ETH-001`..`ETH-002` |
| SPEC | Agent Skills `SKILL.md` specification |

---

## 2. OVERALL DESCRIPTION

### 2.1 Product perspective

AppMD is an **intelligence layer over an existing ecosystem it does not own**. This single fact
generates most of the non-obvious requirements in this document. AppMD does not author the
skills it indexes, cannot execute them, has no relationship with their authors, and holds no
rights over their content beyond what each upstream licence grants.

Three consequences that requirements must enforce rather than merely acknowledge:

1. **Attribution and provenance are functional requirements, not metadata hygiene.** A record
   that has lost its origin is not a degraded record; it is an unusable one.
2. **Default-deny on rights.** Absence of a known licence is never permission (BRIEF §38).
3. **Every derived claim is falsifiable and attributed to its producer.** A trust score without
   its findings and analyser version is an unaccountable assertion about a third party (`ETH-001`).

### 2.2 User classes

| Class | Need | Phase 1? |
| --- | --- | --- |
| AI agent | Resolve a goal into a minimal, safe, compatible skill set | Read API only |
| Developer / CLI user | Search, inspect, verify before installing | Read API only |
| AppMD operator (the user) | Run ingestion, observe it, diagnose failures, reprocess | **Yes** |
| Skill author (third party) | Correct attribution, visible provenance, a route of appeal | **Yes** (`REQ-039`) |

Skill authors did not opt in. They are a user class with rights, not a data source.

### 2.3 Constraints

| ID | Constraint | Evidence |
| --- | --- | --- |
| C-1 | No bulk scraping of SkillsMP; ToS forbids it | R1 §3 |
| C-2 | SkillsMP REST 500/day, MCP 30 calls/60s; keyword-only, capped window | R1 §2.2–2.3 |
| C-3 | GitHub code search 10 req/min, 1,000 results/query | R1 §4.1 |
| C-4 | `SKILL.md` guarantees only `name` + `description`; unknown keys must be tolerated | R1 §5 |
| C-5 | No Cloudflare paid plan; Phase 1 runs locally | `DEC-010` |
| C-6 | Queue messages ≤128 KB where Cloudflare Queues is the adapter | R1 §6.2, `DEC-005` |
| C-7 | Vectorize ≤1,536 dimensions, topK ≤50 with metadata (future phases) | R1 §6.4 |
| C-8 | No content served in Phase 1, regardless of licence | `DEC-009` |
| C-9 | Solo developer; avoid enterprise ceremony | intake Q7 |

### 2.4 Assumptions

`DEC-004` (robots/API interpretation, **unconfirmed**), `DEC-007` (canonical store undecided
until G2), `DEC-013` (shard sampling bias accepted and stated).

---

## 3. DOMAIN MODEL

The domain model precedes the storage decision deliberately. Requirements describe *what is
true about the world*; `DATABASE.md` will decide how to persist it.

```
                          ┌──────────────┐
                          │    Source    │  skillsmp | github | gitskills-corpus
                          └──────┬───────┘
                                 │ discovers
                                 ▼
   ┌──────────────┐      ┌───────────────────┐
   │  Repository  │◄─────│ SkillOccurrence   │  one SKILL.md at one path in one repo
   │ owner/name   │ in   │ + raw content     │  NOT an identity
   │ licence L2   │      └─────────┬─────────┘
   └──────────────┘                │ resolves to (many-to-one)
                                   ▼
                          ┌────────────────┐
                          │ CanonicalSkill │  AppMD identity
                          └───┬────────┬───┘
                              │        │
              ┌───────────────┘        └──────────────┐
              ▼                                       ▼
     ┌─────────────────┐                   ┌──────────────────┐
     │ ProvenanceRecord│  per field:       │  RightsPosture   │  L1/L2/L3 → 4 booleans
     │ fact|inference  │  source, conf.    │  default deny    │
     └─────────────────┘                   └──────────────────┘
```

| ID | Domain requirement | Rationale |
| --- | --- | --- |
| **DOM-001** | A `SkillOccurrence` is uniquely keyed by `(source_id, repo_full_name, path, content_hash)`. It is an observation, never an identity. | R2 §2; BRIEF §13 |
| **DOM-002** | A `CanonicalSkill` is an AppMD-assigned identity to which one or more occurrences resolve. Its id is stable, opaque, and never derived from a mutable attribute (name, URL, star count). | BRIEF §9, §13 |
| **DOM-003** | Canonical identity derives from **origin repository coordinates plus content**, never from an aggregator's identifier. | `DEC-014` |
| **DOM-004** | Two occurrences are `EXACT_DUPLICATE` iff their raw content hashes are equal. | `DEC-012` |
| **DOM-005** | Occurrence relationships are drawn from a closed vocabulary: `EXACT_DUPLICATE`, `NEAR_DUPLICATE`, `FORK`, `MIRROR`, `VERSION`, `RELATED`, `ALTERNATIVE`, `UNRELATED`. Name equality alone never establishes any of them. | BRIEF §13 |
| **DOM-006** | Every field value in a `CanonicalSkill` is either a **source fact** (with its source) or an **AppMD inference** (with producer, version and confidence). There is no third kind and the two are never merged into one field. | BRIEF §12; `ETH-001` |
| **DOM-007** | Licence is three independent layers: L1 dataset/aggregator, L2 repository, L3 frontmatter claim. L3 is a claim, not an authority. Conflicts are recorded, never silently resolved. | `DEC-006` |
| **DOM-008** | Rights posture is **computed**, never stored as a single inherited flag. It carries the brief's four concepts: `indexable`, `linkable`, `redistributable`, and **`unknown` as an explicit state in its own right** — never silently collapsed into all-false booleans. `cacheable` is tracked additionally where architecture requires it and never substitutes for `unknown`. An `unknown` posture denies redistribution **and** records that the denial rests on absent evidence rather than on evidence of prohibition. | `DEC-018`; BRIEF §38 |
| **DOM-009** | A `Repository` is the attribution unit and the L2 licence holder. Attribution is mandatory on every canonical record. | `ETH-002` |
| **DOM-010** | Raw content is immutable once stored and addressed by its content hash. Normalisation never mutates raw. | BRIEF §10 |
| **DOM-011** | A skill's temporal state (`first_commit_at`, `last_commit_at`, `discovered_at`, `last_verified_at`) is a first-class attribute; freshness is derived from it, never assumed. | BRIEF §34 |
| **DOM-013** | Identity in the corpus resolves to three distinct classes — **repository identity**, **organisation identity**, and **individual author identity** — which carry different privacy weight and shall not be conflated. Only personal information necessary for provenance and attribution is retained; anything beyond that is not collected. | `DEC-020`; intake Q5 |
| **DOM-012** | A `Source` has an access policy — rate limits, permitted methods, ToS constraints — that is **data, not code**, and is enforced by the runtime. | BRIEF §49–50; `DEC-004` |

---

## 4. FUNCTIONAL REQUIREMENTS

Priority: **M** mandatory for Phase 1 · **S** should · **F** future phase, stated to prove the
architecture accommodates it. Only **M** requirements gate G4.

### 4.1 Source connectors

| ID | Requirement | Pri |
| --- | --- | --- |
| **REQ-001** | The system shall define a `SourceConnector` contract with operations `discover()`, `fetch()`, `identify()`, `getMetadata()`, `getContent()`, `getVersion()`. No core component shall reference a named source. | M |
| **REQ-002** | Every connector shall emit `DiscoveryRecord` objects of one normalised shape regardless of source. | M |
| **REQ-003** | The system shall implement `GitSkillsCorpusConnector` reading the CC-BY-4.0 Parquet corpus. | M |
| **REQ-004** | The system shall implement `SkillsMPConnector` using **only** the documented REST and MCP endpoints, never HTML scraping of `/creators/**`. | M |
| **REQ-005** | The system shall implement `GitHubConnector` resolving `owner/repo` + path to repository metadata, licence and content via the official API. Demoted because the corpus supplies both content and L2 licence; the `SourceConnector` abstraction (`REQ-001`, `REQ-008`) remains **M** and is unaffected. | S |
| **REQ-006** | Each connector shall declare its access policy — rate limits, auth mode, permitted methods, ToS notes — as data the runtime enforces. | M |
| **REQ-007** | The system shall reject registration of a connector that declares no access policy. | M |
| **REQ-008** | Adding a new source shall require no modification to discovery, queue, parse, normalise, fingerprint, dedup or storage code. Demonstrated by two connectors of genuinely different shape (bulk corpus vs rate-limited API). | M |

### 4.2 Discovery

| ID | Requirement | Pri |
| --- | --- | --- |
| **REQ-009** | Discovery shall be separable from ingestion and independently re-runnable, answering only "what exists?". | M |
| **REQ-010** | Discovery shall be resumable from a persisted cursor after interruption, without re-emitting completed work. | M |
| **REQ-011** | Re-running discovery over unchanged source state shall create no new canonical skills (idempotence). | M |
| **REQ-012** | Discovery shall accept a bounded batch limit, so operators may run 100, then 1,000, then 10,000. | M |
| **REQ-013** | Discovery shall record, per run: source, parameters, start/end time, count discovered, count skipped, errors. | M |
| **REQ-014** | The system shall poll the SkillsMP RSS feed for incremental discovery. | S |

### 4.3 Queue and job model

| ID | Requirement | Pri |
| --- | --- | --- |
| **REQ-015** | Each pipeline stage shall be an independently queued job whose worker concurrency is configurable per stage, such that changing one stage's concurrency requires no change to any other stage's configuration or code. | M |
| **REQ-016** | Every job shall be **idempotent**: re-execution with identical input produces identical state and no duplicate records. | M |
| **REQ-017** | Every job shall carry `job_id`, `skill_ref`, `source`, `attempt`, `status`, `started_at`, `completed_at`, `error`. | M |
| **REQ-018** | Queue messages shall carry references (storage key, content hash, ids), **never content**. | M |
| **REQ-019** | A failed job shall retry with exponential backoff and jitter to a configured maximum attempt count. | M |
| **REQ-020** | A job exceeding maximum attempts shall move to a dead letter queue, never retry indefinitely. | M |
| **REQ-021** | Dead-lettered jobs shall be listable, inspectable, and manually re-submittable. | M |
| **REQ-022** | Failure of one job shall not halt, restart or re-run the pipeline for any other job. | M |
| **REQ-023** | The queue shall be provided through a port interface with a local adapter and a Cloudflare Queues adapter. | M |
| **REQ-095** | The system shall support **re-analysis**: given a change of analyser version, analysis rules, model, or security rules, it shall identify every affected canonical record and enqueue it for reprocessing, without re-contacting any source (`REQ-032`). Each derived result shall record the analyser id and version that produced it, so "affected" is a query rather than a guess. Phase 1 implements identification and enqueue for the deterministic analysers it actually has; the mechanism is what matters, not the number of analysers using it. | M |

### 4.4 Fetch

| ID | Requirement | Pri |
| --- | --- | --- |
| **REQ-024** | The fetcher shall enforce per-source rate limits, concurrency caps, backoff, jitter and `Retry-After`. | M |
| **REQ-025** | The fetcher shall open a circuit breaker on repeated source failure and report it. The abstraction is defined in Phase 1 and retained for future network-based connectors; only the local-corpus path may omit an implementation. | S |
| **REQ-026** | The fetcher shall send a truthful, contactable User-Agent identifying AppMD, and shall never impersonate a browser or another bot. | M |
| **REQ-027** | The system shall contain **no** mechanism for evading rate limits, bot detection, authentication or access controls. | M |
| **REQ-028** | The fetcher shall skip re-fetch when the source reports content unchanged (ETag / `lastmod` / commit sha). | M |
| **REQ-096** | Every web-based connector shall retrieve the source's robots policy where one applies, cache it with a stated freshness, and evaluate each request against it before issuing it. A request that a directive disallows shall not be issued. Connectors operating an explicitly authorised API shall record which access channel each request uses, so API consumption and crawling remain separable in the record (`NFR-037`, `DEC-004`). | M |

### 4.5 Raw storage

| ID | Requirement | Pri |
| --- | --- | --- |
| **REQ-029** | Raw content shall be stored immutably, addressed by content hash, before any parsing. Immutability governs the **provenance envelope**; content bytes are subject to the retention lifecycle of `REQ-098` (`DEC-015`, `DEC-019`). | M |
| **REQ-030** | Each raw record shall retain: original bytes, source, source URL, retrieval timestamp, source version, content hash. | M |
| **REQ-031** | Normalisation shall never mutate or delete raw records; RAW → PARSED → CANONICAL are distinct layers. | M |
| **REQ-032** | The system shall reprocess stored raw content into canonical records **without re-contacting the source**. | M |
| **REQ-033** | Raw content shall be treated as internal processing data, behind an access-control layer, and shall not be served publicly in Phase 1. | M |
| **REQ-034** | Every raw record shall carry a retention rule derived from its rights posture, and shall be deletable both on request and on retention expiry, the deletion recorded as a tombstone that survives the bytes. | M |
| **REQ-098** | Raw content retention shall be **rights-aware and default to non-permanent** (`DEC-019`). The system shall not indefinitely retain full third-party content by default. Where content is required only for processing, the system shall process it, derive the required metadata, retain the **provenance envelope** (content hash, source, URL, timestamps, licence layers, rights posture), and delete the raw bytes once retention is no longer justified. **`unknown` and restrictive rights postures receive the shortest retention.** The provenance envelope and any tombstone survive byte deletion permanently (`DEC-015`). | M |

### 4.6 Parse and normalise

| ID | Requirement | Pri |
| --- | --- | --- |
| **REQ-035** | The parser shall extract YAML frontmatter and Markdown body from `SKILL.md`. | M |
| **REQ-036** | The parser shall treat only `name` and `description` as required, and shall **preserve unrecognised frontmatter keys rather than rejecting or discarding them**. | M |
| **REQ-037** | The parser shall handle malformed YAML, absent frontmatter, empty files and non-UTF-8 bytes by recording a parse failure with reason — never by crashing and never by silently emitting an empty record. | M |
| **REQ-038** | The parser shall record `frontmatter_valid` per the spec's stated constraints (`name` ≤64 chars `[a-z0-9-]`, `description` non-empty ≤1024, no XML tags, reserved words). | M |
| **REQ-039** | Normalisation shall produce a canonical record carrying mandatory attribution: repository, owner, canonical source URL. A record shall not be storable without them. | M |
| **REQ-040** | Normalisation shall record every field as source fact or AppMD inference, with provenance, and shall never merge the two into one field. | M |
| **REQ-041** | The parser's `frontmatter_valid` verdict shall be comparable against the corpus's own column, and disagreements shall be reportable. | M |

### 4.7 Fingerprint and deduplicate

| ID | Requirement | Pri |
| --- | --- | --- |
| **REQ-042** | The system shall compute `content_hash` (SHA-256 over raw bytes) for every occurrence. | M |
| **REQ-043** | The system shall compute `normalised_hash` (SHA-256 over normalised text: line endings, trailing whitespace, frontmatter key order). | M |
| **REQ-044** | Occurrences with equal `content_hash` shall resolve to one `CanonicalSkill` as `EXACT_DUPLICATE`. | M |
| **REQ-045** | Deduplication shall never use name equality alone as evidence of duplication. | M |
| **REQ-046** | Every occurrence shall remain individually retrievable after deduplication, with its repository and path. Dedup collapses identity, never evidence. | M |
| **REQ-047** | Deduplication results shall be measurable against the corpus's published verdict, reporting precision, recall and a disagreement list. | M |
| **REQ-048** | The system shall record `MIRROR` and `FORK` relationships using repository fork metadata as a distinct signal from content equality. | S |
| **REQ-049** | Near-duplicate detection via semantic fingerprinting. | F |

### 4.8 Canonical storage

| ID | Requirement | Pri |
| --- | --- | --- |
| **REQ-050** | The canonical store shall hold `CanonicalSkill`, `SkillOccurrence`, `Repository`, `Source`, `ProvenanceRecord`, `RightsPosture`. | M |
| **REQ-051** | The canonical store shall be the single source of truth. Search, vector and graph indexes shall be **derived and rebuildable from it**. | M |
| **REQ-052** | The system shall rebuild every derived index from canonical data with no source contact, demonstrated by a test that destroys and rebuilds an index. | M |
| **REQ-053** | The canonical schema shall be extensible: new fields shall not require rewriting existing records. | M |
| **REQ-054** | The store shall be provided through a port interface with a local adapter; the production adapter is chosen in `DATABASE.md` at G2. | M |
| **REQ-055** | Historical versions shall never be silently overwritten; a content change creates a new version linked to its predecessor. | M |
| **REQ-091** | The system shall provide operator commands to **back up** the canonical store, **restore** it to a target location, and **verify** a restore by comparing record count and content-hash digest against the snapshot. Backup and restore shall function with no derived index present and no source contact (`NFR-035`). | M |
| **REQ-094** | Every canonical record shall carry a **schema version**. The system shall provide a forward migration path that transforms records from an older schema version to the current one **without destroying data**: migrations shall be re-runnable, shall record which records they touched, and shall be verifiable by restoring a pre-migration backup. A migration that cannot preserve a field shall fail rather than drop it. | M |

### 4.9 Licensing, rights and attribution

| ID | Requirement | Pri |
| --- | --- | --- |
| **REQ-056** | The system shall record L1, L2 and L3 licence layers independently, each with its evidence. | M |
| **REQ-057** | The system shall normalise licence identifiers to SPDX where recognised, and to `UNKNOWN` otherwise — never to a guess. | M |
| **REQ-058** | Absent, unparseable or conflicting licence shall yield `redistributable = false`. | M |
| **REQ-059** | The system shall compute and store `indexable`, `linkable`, `cacheable`, `redistributable`, each with the layer and evidence that produced it. | M |
| **REQ-060** | Where L2 and L3 conflict, both shall be retained, the conflict flagged, and the **more restrictive** applied for redistribution. | M |
| **REQ-061** | Every publicly exposed record shall carry attribution and canonical source URL. The API shall be incapable of emitting a record without them. | M |
| **REQ-062** | The Phase 1 API shall not serve third-party skill content under any licence condition. | M |
| **REQ-063** | The system shall provide an author-initiated correction/removal path, recording the request, the actor, the disposition and the timestamp. The path exists in Phase 1 even though Phase 1 exposes no content, because removal touches the canonical model and the ingestion pipeline and cannot be retrofitted cheaply. | **M** |
| **REQ-092** | The system shall classify every retained identity as **repository**, **organisation**, or **individual author** (`DOM-013`), and shall record, per person-linked field, the provenance purpose that justifies retaining it. A person-linked field with no stated purpose shall not be stored. | M |

### 4.10 Read API

| ID | Requirement | Pri |
| --- | --- | --- |
| **REQ-064** | The system shall expose a versioned HTTP API under `/api/v1/`. | M |
| **REQ-065** | `GET /api/v1/skills/:id` shall return one canonical skill with provenance, rights posture and attribution. | M |
| **REQ-066** | `GET /api/v1/skills` shall list skills with cursor-based pagination. Offset pagination shall not be used. | M |
| **REQ-067** | `GET /api/v1/skills/:id/occurrences` shall return the occurrences resolving to that canonical skill, **cursor-paginated** per `NFR-039`. | M |
| **REQ-068** | `GET /api/v1/sources/:id` shall return source metadata and its declared access policy. | M |
| **REQ-069** | `GET /api/v1/search` shall provide keyword search over canonical metadata. | M |
| **REQ-070** | API responses shall distinguish source facts from AppMD inferences in their structure, not in prose. | M |
| **REQ-071** | The API shall never emit secrets, credentials, internal storage keys or raw content. | M |
| **REQ-093** | The API shall not expose personal information beyond what attribution requires — the public account identifier and the canonical source URL. Fields classified as individual-author identity (`REQ-092`) shall be omitted from public responses unless attribution requires them. | M |
| **REQ-097** | The API shall apply rate limiting through a port interface, so limits are configuration rather than code. Phase 1 requires exactly one implementation: **in-process, enforcing a configurable request budget per client identifier over a configurable time window, returning HTTP 429 with `Retry-After` on breach.** Distributed or shared-state rate limiting is future work (`DEC-021`). | M |
| **REQ-072** | A CLI shall consume the same API surface as any future frontend. | S |
| **REQ-073** | MCP tool exposure. | F |
| **REQ-074** | Semantic/hybrid search, capability, graph, resolution and composition endpoints. | F |

### 4.11 Security analysis

| ID | Requirement | Pri |
| --- | --- | --- |
| **REQ-075** | The system shall record deterministic security signals available in Phase 1 without executing content: presence of scripts, `allowed-tools` declarations, and detectable credential/network/shell patterns. | S |
| **REQ-076** | Security findings shall be stored as **AppMD inference**, with analyser id, version and timestamp, never as source fact. | M |
| **REQ-077** | Any published score shall be accompanied by its findings and their evidence. A bare score shall not be emitable. | M |
| **REQ-078** | Absence of findings shall be reported as absence of findings, never as "safe". | M |
| **REQ-079** | The system shall never represent analysis as certification or a guarantee of safety. | M |
| **REQ-080** | Content shall never be executed, at any stage, for any purpose. | M |
| **REQ-081** | Behavioural diffing between versions to detect malicious change. | F |

### 4.12 Observability

| ID | Requirement | Pri |
| --- | --- | --- |
| **REQ-082** | The system shall emit counters for: discovered, fetched, failed, parsed, duplicated, stored, dead-lettered. | M |
| **REQ-083** | The system shall report queue depth, processing latency per stage, and per-source error rates. | M |
| **REQ-084** | Every job's lifecycle shall be queryable by `job_id` and by `skill_ref`. | M |
| **REQ-085** | An ingestion run shall produce a report stating counts, failures, and **any sampling bias or truncation applied** (`DEC-013`). | M |
| **REQ-086** | Logs shall never contain secrets, credentials or tokens. | M |
| **REQ-087** | AI processing cost accounting. | F |

### 4.13 Operator interface

| ID | Requirement | Pri |
| --- | --- | --- |
| **REQ-088** | An operator shall trigger discovery, ingestion, reprocessing and index rebuild via CLI without a frontend. | M |
| **REQ-089** | An operator shall inspect any skill, occurrence, job or dead-letter entry via CLI. | M |
| **REQ-090** | An operator shall re-run the pipeline over stored raw content without source contact. | M |

---

## 5. NON-FUNCTIONAL REQUIREMENTS

Every NFR below is measurable. Per Article 4, "fast", "scalable" and "secure" are not
requirements; the following are.

### 5.1 Correctness — the Phase 1 priority

| ID | Requirement |
| --- | --- |
| **NFR-001** | Re-running the full pipeline over an identical input batch shall produce a byte-identical canonical record set. Verified by hashing the canonical output of two independent runs. |
| **NFR-002** | Exact-duplicate detection shall achieve ≥99.9% agreement with the corpus's `dedup_primary` on exact-content grouping over a ≥10,000-row sample. **This is a quality target, not an automatic gate failure** (`DEC-023`): a shortfall is a finding to triage, since legitimate policy differences from the oracle are expected. The binding obligation is that **every disagreement is individually explained**; an unexplained disagreement *is* a gate failure. |
| **NFR-003** | Parser `frontmatter_valid` shall agree with the corpus column on ≥99% of a ≥10,000-row sample; every disagreement shall be triaged as a defect in one implementation or the other. |
| **NFR-004** | 100% of canonical records shall carry attribution and canonical source URL. A record lacking either shall be rejected at write time, not filtered at read time. |
| **NFR-005** | 100% of canonical field values shall be classifiable as source fact or AppMD inference. |
| **NFR-006** | 0 canonical records shall carry `redistributable = true` without a recorded L2 licence evidencing it. |

### 5.2 Reliability

| ID | Requirement |
| --- | --- |
| **NFR-007** | No single job failure shall cause reprocessing of already-completed work. Verified by injecting failure at row *n* of 10,000 and asserting rows 1..*n*−1 are untouched. |
| **NFR-008** | The pipeline shall resume from its persisted cursor after abrupt termination (`SIGKILL`) with no duplicate canonical records and no lost jobs. |
| **NFR-009** | Every stage shall be idempotent: executing the same job 10 times shall produce the state of executing it once. |
| **NFR-010** | Canonical data shall be recoverable such that deleting every derived index and rebuilding produces an equivalent index, with no source contact. Where records have been tombstoned (`DEC-015`), the rebuild is equivalent **minus tombstoned records**, and the rebuild report shall state that count rather than reporting an identical index. |
| **NFR-035** | The canonical store shall be recoverable **independently of every derived index and of every external source**. Phase 1 targets: **RPO ≤ 24 hours** (at most one day of ingestion replayable), **RTO ≤ 4 hours** (restore and verify on the development machine). The backup shall be a periodic full snapshot of canonical data plus its schema version. The restore procedure shall be documented and **executed at least once** in Phase 1, not merely written; recovery is verified by restoring to a scratch location and asserting record count and a content-hash digest match the source snapshot. Deliberately minimal per `DEC-021`: a copied, verified, restorable file — no replication, no clustering, no point-in-time machinery. |

### 5.3 Performance (Phase 1 scale, local hardware)

| ID | Requirement |
| --- | --- |
| **NFR-011** | **PROVISIONAL TARGET, NOT AN ACCEPTANCE CRITERION** (`DEC-017`). Working figure: a 10,000-occurrence batch end-to-end in ≤30 minutes on the development machine. This number was invented by the analyst with no benchmark behind it. It shall not gate G4 and shall be replaced by a measured target, set from Phase 1 benchmark data by `[metrologist]`, before it binds anything. |
| **NFR-012** | `GET /api/v1/skills/:id` shall respond in ≤200 ms at p95 against a 10,000-skill store, measured locally. |
| **NFR-013** | Fetch concurrency shall be configurable per source and shall default to ≤6 simultaneous outgoing connections, matching the Workers ceiling so local behaviour predicts production behaviour (R1 §6.3). |
| **NFR-014** | Memory use per worker process shall stay ≤128 MB, matching the Workers isolate limit, so no design depends on headroom production will not have. |

### 5.4 Cost

| ID | Requirement |
| --- | --- |
| **NFR-015** | Phase 1 shall complete with **zero** LLM or embedding API spend. Deterministic processing only. |
| **NFR-016** | No pipeline stage shall require a paid cloud plan to run locally (`DEC-010`). |
| **NFR-017** | Every future AI-derived result shall be cached keyed by content hash and analyser version; unchanged content shall never be reprocessed (BRIEF §16). |
| **NFR-018** | Corpus disk use in Phase 1 shall not exceed 1 GB (`DEC-011`: `repos` + one `artifacts` shard). |

### 5.5 Security and confidentiality

| ID | Requirement |
| --- | --- |
| **NFR-019** | No secret shall appear in source control, logs, raw records, canonical records or API responses. Verified by a secret-scan in CI over the working tree and by assertion tests over log and API output. |
| **NFR-020** | All credentials shall be supplied by environment/secret store, never by literal. |
| **NFR-021** | Third-party content shall be treated as untrusted input at every stage; no stage shall execute, evaluate or shell out to it. |
| **NFR-022** | Parsing shall be resistant to malformed, adversarial and oversized input; a 100 MB file, a YAML bomb and invalid UTF-8 shall each fail cleanly with a recorded reason. |
| **NFR-036** | Personal information shall be limited to what provenance and attribution require (`DOM-013`). The system shall not collect email addresses, real names beyond the public account identifier, follower graphs, contribution histories, or any field not required to attribute a skill to its origin. Verified by a field-level audit asserting every retained person-linked field maps to a stated provenance purpose. |

### 5.6 Legal and ethical

| ID | Requirement |
| --- | --- |
| **NFR-023** | The system shall respect every declared source rate limit and `Retry-After`, verified by a test asserting no request exceeds the declared budget. |
| **NFR-024** | The system shall contain no access-control, rate-limit or bot-detection circumvention (BRIEF §50). |
| **NFR-025** | Attribution shall be preserved through every transformation, from discovery to API response. |
| **NFR-026** | GitSkills CC-BY-4.0 attribution shall appear in the repository and in any output derived from that corpus. |
| **NFR-037** | Every web-based connector shall fetch and honour the source's robots policy where one applies, together with `Crawl-delay` and `Retry-After`, and shall never bypass a restriction. Where a source explicitly authorises API access, the connector shall remain **distinguishable from an autonomous crawler** — identifying itself truthfully and operating within the documented API contract (`DEC-004`). Verified by a test asserting no request violates a declared directive. |
| **NFR-038** | All system timestamps shall be UTC, machine-readable, and consistently formatted (RFC 3339, e.g. `2026-08-27T13:45:00Z`). Local time and naive timestamps shall not appear in any stored record, log line or API response. |

### 5.7 Maintainability and portability

| ID | Requirement |
| --- | --- |
| **NFR-027** | Every infrastructure dependency (queue, object store, canonical store, cache, scheduler) shall sit behind a port interface with at least two adapters, one of which requires no cloud account. |
| **NFR-028** | Business logic shall not import a vendor SDK. Verified by a dependency-direction lint rule, not by review discipline. |
| **NFR-029** | Moving from local to Cloudflare shall require configuration and adapter selection only, with no change to pipeline logic. |
| **NFR-030** | Unit tests shall run with no network access. |

### 5.8 Scalability posture

| ID | Requirement |
| --- | --- |
| **NFR-031** | No design element shall assume the full dataset fits in memory or in one process. |
| **NFR-032** | All traversal shall be cursor-based; no offset pagination anywhere. |
| **NFR-039** | **Every API collection whose size is not provably bounded shall be cursor-paginated with an enforced maximum page size.** This is a structural rule, not a per-endpoint decision: an endpoint returning an unbounded collection shall not be addable. Covers `REQ-066`, `REQ-067` and every future collection endpoint. |
| **NFR-033** | Canonical identity shall be partitionable by content hash prefix without schema change. |
| **NFR-034** | The architecture shall document its next binding constraint at 1M, 10M and 100M skills, with the evidence for each (BRIEF §51). |

---

## 6. CANONICAL SKILL SCHEMA (requirements-level)

Structure is normative; storage representation is decided at G2. Note the shape: **no bare
values on inferred fields**, and rights are computed, not stored as an inherited flag.

```jsonc
{
  "schema_version": 1,                   // REQ-094 — migration target, never implicit
  "id": "cs_01J...",                    // DOM-002: opaque, stable, never derived from mutable data
  "identity": {
    "primary_occurrence": "occ_...",     // the representative
    "content_hash": "sha256:...",        // REQ-042
    "normalised_hash": "sha256:...",     // REQ-043
    "occurrence_count": 47,              // REQ-046: evidence retained
    "relationship_summary": { "EXACT_DUPLICATE": 46, "FORK": 1 }
  },

  "attribution": {                       // REQ-061, NFR-004 — record invalid without this
    "repository": "owner/repo",
    "owner": "owner",
    "canonical_source_url": "https://github.com/owner/repo/blob/.../SKILL.md",
    "path": "skills/foo/SKILL.md"
  },

  "declared": {                          // DOM-006: SOURCE FACTS ONLY
    "name": "foo",
    "description": "...",
    "frontmatter": { "...": "unrecognised keys preserved verbatim (REQ-036)" },
    "frontmatter_valid": true,
    "allowed_tools": ["..."]             // REQ-075: security-relevant
  },

  "inferred": {                          // DOM-006: APPMD INFERENCE ONLY — never merged above
    "capabilities": [
      { "value": "...", "producer": "cap-engine", "version": "0.1.0",
        "confidence": 0.82, "at": "2026-08-27T..." }
    ]
    // Phase 1 emits nothing here. The compartment exists so that when it does,
    // no consumer has to learn a new shape and no field changes meaning.
  },

  "licence": {                           // DOM-007, REQ-056
    "l1_dataset":    { "spdx": "CC-BY-4.0", "evidence": "zenodo:10.5281/..." },
    "l2_repository": { "spdx": "MIT",       "evidence": "repos.license" },
    "l3_declared":   { "spdx": "Apache-2.0","evidence": "frontmatter.license" },
    "conflict": true                     // REQ-060: recorded, not resolved away
  },

  "rights": {                            // DOM-008 — computed (REQ-059), brief §38's four concepts
    "state": "known",                    // "known" | "unknown"  ← EXPLICIT, never collapsed (DEC-018)
    "indexable": true,
    "linkable": true,
    "redistributable": false,
    "cacheable": true,                   // tracked additionally; never a substitute for "unknown"
    "basis": "L2/L3 conflict → most restrictive applied",
    "computed_at": "2026-08-27T13:45:00Z"
  },
  // When state == "unknown": redistributable is false, and the record says the denial rests on
  // ABSENT EVIDENCE, not on evidence of prohibition. Those are different facts about the world
  // and a system that reports them identically is lying by omission.

  "retention": {                         // REQ-098, DEC-019 — rights-aware, default non-permanent
    "raw_bytes_held": true,
    "policy": "process-then-reduce",     // unknown/restrictive → shortest retention
    "expires_at": "2026-09-27T00:00:00Z",
    "tombstone": null                    // survives byte deletion permanently (DEC-015)
  },

  "temporal": {                          // DOM-011
    "first_commit_at": "...", "last_commit_at": "...",
    "discovered_at": "...",   "last_verified_at": "..."
  },

  "identity_class": "individual",        // REQ-092 / DOM-013: repository | organisation | individual

  "provenance": {                        // REQ-040
    "sources": [ { "source_id": "gitskills", "external_ref": "...", "at": "..." } ],
    "field_origins": { "declared.name": "source_fact:gitskills", "...": "..." }
  },

  "security": {},                        // REQ-076: inference-shaped, empty in Phase 1
  "quality":  {},                        // BRIEF §17, future
  "versions": []                         // REQ-055
}
```

---

## 7. OUT OF SCOPE — Phase 1

Frontend, dashboards, marketplace, accounts, payments, recommendation learning, success
feedback, skill composition, master skills, skill compiler, agent-specific packaging, context
optimisation, skill router, graph traversal API, semantic/vector search, capability engine,
resolution engine, conflict detection, gap analysis, snapshots and malicious-change detection,
source reputation scoring.

Each is addressed architecturally in §4.10 / `ARCHITECTURE.md` to prove Phase 1 does not
foreclose it. None is implemented.

**Phase 1 shall not be expanded into** AI, embeddings, Vectorize, knowledge graph, skill
resolution, skill composition, or billion-scale infrastructure. Those remain future architecture.

### 7.1 Governing principle (`DEC-021`)

> **Design for future scale without implementing future scale.**

| Phase 1 | Future |
| --- | --- |
| simple, cheap, testable | replaceable components, horizontal scaling |

No distributed infrastructure is introduced merely because 1B+ records are eventually wanted.
The obligation Phase 1 carries is that components are **replaceable** (`NFR-027`, `NFR-028`) and
that no design element **forecloses** scaling (`NFR-031`–`NFR-034`) — not that any of it is built.

This principle outranks any individual requirement in this document. Where a requirement could be
read as demanding infrastructure Phase 1 does not need, it is read the narrower way.

---

## 8. TRACEABILITY

`.ilana/traceability.csv` maps `REQ`/`NFR`/`DOM` → design → module → test.
Article 3: no production code without a requirement id; no requirement without ≥1 test case.

**Counts:** 90 functional (`REQ-001`..`REQ-090`), 34 non-functional (`NFR-001`..`NFR-034`),
12 domain (`DOM-001`..`DOM-012`). Phase 1 mandatory: **80** `REQ` at priority **M** (counted from `.ilana/traceability.csv`, not asserted).

---

## 9. OPEN ITEMS CARRIED INTO ARCHITECTURE

| Item | Blocks | Owner |
| --- | --- | --- |
| `RSK-002` / `DEC-004` — SkillsMP robots vs API, unconfirmed | REQ-004 | `[ethics-officer]` |
| `RSK-005` — Cloudflare Queues DLQ support UNVERIFIED | REQ-020, REQ-023 | `[architect]` |
| `ETH-001` — trust-score publication conditions | REQ-076..079 | `[ethics-officer]` |
| `DEC-007` — canonical store undecided | REQ-050, REQ-054 | `[architect]`, resolved in `DATABASE.md` |
| `DEC-013` — shard sampling bias | NFR-002, NFR-003 | `[metrologist]` |

---

## 10. CHANGE LOG — v1.0 → v1.1

All changes arise from the stakeholder review of 2026-08-27 (G1 criterion 7). No requirement ID
was reused or renumbered; IDs are immortal per the Ìlànà kernel.

### Modified (10)

| ID | Change | Authority |
| --- | --- | --- |
| `DOM-008` | Rights model restored to the brief's four concepts. **`unknown` is an explicit state**, not all-false booleans. `cacheable` tracked additionally, never as a substitute | user #14, `DEC-018` |
| `REQ-005` | `GitHubConnector` **M → S**. `SourceConnector` abstraction stays **M** | user #12 |
| `REQ-025` | Circuit breaker **M → S**; abstraction retained for future network connectors | user #11 |
| `REQ-029` | Immutability now governs the provenance envelope; bytes follow `REQ-098` | user #15 |
| `REQ-034` | Retention rule derived from rights posture; deletion on request **and** expiry | user #15 |
| `REQ-063` | Author correction/removal **S → M** | user #2 |
| `REQ-067` | Occurrences endpoint now cursor-paginated | user #5 |
| `NFR-002` | 99.9% is a **quality target, not an automatic gate failure**. Unexplained disagreement remains a failure | user #13, `DEC-023` |
| `NFR-010` | Rebuild after tombstoning is "equivalent minus tombstoned", and the count is reported | `DEC-015` |
| `NFR-011` | **Demoted to PROVISIONAL TARGET.** Does not gate G4. To be replaced by a measured target | user #1, `DEC-017` |

### Added (14)

| ID | Requirement | Authority |
| --- | --- | --- |
| `DOM-013` | Three identity classes: repository / organisation / individual author | user #4 |
| `REQ-091` | Canonical backup, restore and restore-verification commands | user #3 |
| `REQ-092` | Identity classification + per-field provenance purpose | user #4 |
| `REQ-093` | API withholds personal information beyond attribution need | user #4 |
| `REQ-094` | Schema version + non-destructive forward migration | user #6 |
| `REQ-095` | Re-analysis: identify affected records and enqueue on analyser/rule/model change | user #7 |
| `REQ-096` | Robots policy retrieval and evaluation per web connector | user #8 |
| `REQ-097` | Configurable API rate limiting via port; simple in-process impl in Phase 1 | user #9 |
| `REQ-098` | Rights-aware, default-non-permanent raw retention | user #15 |
| `NFR-035` | Independent canonical recovery. **RPO ≤ 24 h, RTO ≤ 4 h**, restore executed once in Phase 1 | user #3 |
| `NFR-036` | Data minimisation, verified by field-level audit | user #4 |
| `NFR-037` | Robots / `Crawl-delay` / `Retry-After` compliance; API consumers distinguishable from crawlers | user #8 |
| `NFR-038` | UTC, RFC 3339 timestamps everywhere | user #10 |
| `NFR-039` | Structural rule: every unbounded collection is cursor-paginated | user #5 |

### Added structurally

- **§7.1 governing principle** — *design for future scale without implementing future scale*,
  declared to outrank any individual requirement (user #16, #17, `DEC-021`).
- **Canonical schema** — `schema_version`, `identity_class`, `rights.state`, `retention` block.

### Not changed, and why

- **Scope.** No Phase 1 expansion into AI, embeddings, Vectorize, graph, resolution or
  composition. §7 now states this explicitly rather than leaving it to inference.
- **The 76 requirements untouched by this review** remain as baselined in v1.0.
