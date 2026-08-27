# Changelog

Every entry names its change type (corrective, adaptive, perfective, preventive) and traces to a
`REQ` or `CR`, per `docs/scm-plan.md` §3 and G6 criterion 6.

---

## [0.1.0] — 2026-08-27 — Phase 1 backend

**Release type: MINOR** (first tagged release; `0.x`, nothing deployed, no compatibility promise
made to any consumer).

Proves that AppMD can transform a real-world skill corpus into a canonical,
provenance-preserving, deduplicated index. **Not** the billion-skill system — that is explicitly
future architecture.

### Added — adaptive

| Change | Traces to |
| --- | --- |
| `SourceConnector` contract; GitSkills corpus connector with stratified sampling | `REQ-001`–`003`, `DEC-024` |
| `SkillsMPConnector` — REST discovery, access policy as data, no enumeration | `REQ-004`, `DEC-038` |
| Discovery, queue with native-DLQ semantics, job lifecycle | `REQ-009`–`023`, `DEC-025` |
| RAW storage: content-addressed, immutable, traversal-guarded, self-describing | `REQ-029`–`031` |
| Reprocess from RAW with no source contact | `REQ-032` |
| Rights-aware retention over real bytes | `REQ-034`, `REQ-098`, `DEC-019` |
| Zero-dependency `SKILL.md` parser (restricted YAML subset) | `REQ-035`–`038` |
| Two-tier fingerprinting and deduplication | `REQ-042`–`047`, `DEC-012` |
| Three-layer licence model with `unknown` as an explicit state | `REQ-056`–`060`, `DEC-018` |
| Per-field provenance separating source fact from AppMD inference | `REQ-040`, `DOM-006` |
| Canonical store, schema v3, migrations, backup/restore/verify | `REQ-050`–`055`, `REQ-091`, `REQ-094` |
| Real derived search index and rebuild | `REQ-051`, `REQ-052` |
| Author correction and removal with tombstoning | `REQ-063`, `DEC-015` |
| Re-analysis targeting by analyser version | `REQ-095` |
| Read-only `/api/v1` — 5 endpoints, cursor pagination, rate limiting | `REQ-064`–`071`, `REQ-097` |
| Operator CLI — 20 commands, `--json`, `--confirm` on destructive actions | `REQ-088`–`090`, `UI-001`–`010` |
| Conditional re-fetch, circuit breaker, robots policy | `REQ-028`, `REQ-025`, `REQ-096` |
| 8 adapters across 5 ports, each with an offline implementation | `NFR-027` |

### Fixed — corrective

| Defect | Severity | Found by |
| --- | --- | --- |
| `DEF-001` completing a job overwrote its start time, making duration unmeasurable | Medium | a bind error that was a gift |
| `DEF-002` parser rejected YAML block scalars — **1 in 9 real documents** | High | real corpus data |
| `DEF-003` a non-scalar frontmatter value crashed the canonical write | Medium | real corpus data |
| `DEF-004` a repository name containing `--` reached a query expression | **High, security** | the 1,000-record rung |
| `DEF-005` parser rejected legitimate YAML; the guard flagged markdown emphasis as an alias | High | real corpus data |
| `DEF-006` an absorbed duplicate was never settled, so the consumer looped forever | High, liveness | the suite hung |
| `DEF-007` inline indexing breached the memory budget | Medium | re-running existing evidence |
| `DEF-008` `SkillsMPConnector` absent; a test title concealed it | High | traceability audit |

### Changed — corrective, via change control

| CR | Change |
| --- | --- |
| `CR-002` | `REQ-003` names the **corpus**, not the file format |
| `CR-004` | `NFR-003` grades structural validity; spec conformance is a separate inference |
| `CR-006` | `NFR-014`'s 128 MB binds pipeline and edge, not batch extraction |

### Preventive

Dependency-direction lint with three enforcement modes, each proven by planting a violation ·
cross-adapter contract suites · oracle validation against a corpus we did not create ·
a traceability checker in CI that reports orphan requirements.

### Known gaps — declared, not hidden

| Gap | Priority | Reason |
| --- | --- | --- |
| `REQ-005` `GitHubConnector` | S | Corpus supplies content and L2 licences (`DEC-039`) |
| `REQ-014` RSS polling | S | No consumer for incremental discovery yet (`DEC-039`) |
| Cloudflare deployment | — | `DEC-010`: no paid plan; Phase 2 |
| Live R2 verification | — | Boundary implemented; live I/O needs infrastructure and is **not claimed** |

### Evidence

318 test cases · 139/139 mandatory requirements traced · 10,000 real records ingested with
byte-identical re-runs · 100 records reprocessed with **0 network calls** · 13 near-duplicates found
that the corpus's own oracle cannot see · rollback rehearsed, RTO 3 ms.
