# ROADMAP — Phase 1 Implementation Plan

| | |
| --- | --- |
| Document | `ROADMAP.md` v1.0 · Phase 02 · `[conductor]` · 2026-08-27 |
| Governing | `DEC-021` · **Correctness first. Scale second.** |

---

## 1. What Phase 1 proves

> AppMD can reliably transform a real-world skill corpus into a canonical,
> provenance-preserving, deduplicated skill index.

Not: the billion-skill system. **The proof is correctness under real data**, and the corpus's
row-level oracles make that falsifiable rather than asserted.

## 2. Increments

Each is independently valuable, independently testable, and ends in a demonstrable state.

| # | Increment | Delivers | Key requirements | Exit condition |
| --- | --- | --- | --- | --- |
| **1** | **Skeleton + ports** | repo layout, `ports/`, `skill-core` domain types, dependency lint | `NFR-027`, `NFR-028` | Lint **fails** on a deliberate violation |
| **2** | **Canonical store + backup** | SQLite adapter, schema v1, migrations, backup/restore/verify | `REQ-050`–`055`, `REQ-091`, `REQ-094`, `NFR-035` | Restore executed and verified |
| **3** | **Corpus connector** | `GitSkillsCorpusConnector`, stratified sampling, row-group streaming | `REQ-001`–`003`, `DEC-016`, `DEC-024` | 100 records discovered, bias reported |
| **4** | **Queue + jobs** | local queue, DLQ, job records, retry | `REQ-015`–`023`, `DEC-025` | Consumer **refuses to start** without DLQ |
| **5** | **Parse + normalise** | parser, tolerant frontmatter, failure taxonomy | `REQ-035`–`041`, `NFR-022` | ≥99% oracle agreement, stratified |
| **6** | **Fingerprint + dedup** | both hashes, resolution, occurrence retention | `REQ-042`–`047`, `NFR-002` | ≥99.9% agreement; **0 unexplained** |
| **7** | **Provenance + licence + rights** | 3 layers, computed rights with explicit `unknown`, retention TTL | `REQ-056`–`060`, `REQ-092`, `REQ-098`, `NFR-006` | 0 records `redistributable` without L2 |
| **8** | **Read API + CLI** | `/api/v1` read endpoints, cursor pagination, rate limit, CLI | `REQ-064`–`069`, `REQ-088`–`090`, `REQ-097` | p95 ≤200 ms at 10k |
| **9** | **The ladder** | 100 → 1,000 → 10,000 stratified | `REQ-012`, `NFR-001` | Byte-identical re-run at each rung |
| **10** | **Removal + re-analysis** | correction/removal path, tombstoning, re-analysis enqueue | `REQ-063`, `REQ-095`, `DEC-015` | Removal tombstones; envelope survives |

**Increment 1 gates everything.** If the dependency lint does not fail on a deliberate violation,
`NFR-028` is decoration and `DEC-027`'s migration path is fiction.

## 3. Sequencing rationale

- **Store before pipeline** — a pipeline with nowhere correct to write is untestable.
- **Backup in increment 2, not last** — a restore procedure never executed is a document (`DEC-022`).
- **Queue before parse** — every later stage is a consumer; retrofitting idempotency is expensive
  and at-least-once delivery makes it mandatory (`DEC-025`).
- **Rights before API** — the API must be structurally incapable of emitting an unattributed record
  (`NFR-004`); that constraint has to exist before the serializer does.
- **Ladder last** — scale is earned after correctness, not concurrently.

## 4. Not in Phase 1

AI · embeddings · Vectorize · graph · capability engine · resolution · composition · master skills ·
skill compiler · MCP · frontend · marketplace · accounts · sibling-script analysis · published trust
scores · content redistribution · Cloudflare deployment (`DEC-010`: local first).

Each is addressed in the architecture and none is built (`ARCHITECTURE.md` §6).

## 5. Definition of done

1. All 87 **M** requirements implemented and traced (`.ilana/traceability.csv` → `verified`).
2. Both oracle targets met, **every disagreement explained**.
3. `NFR-001` byte-identical re-run at all three rungs.
4. `NFR-007`/`NFR-008` failure-injection and `SIGKILL`-resume pass.
5. Backup **restored and verified** at least once.
6. Derived index dropped and rebuilt (`NFR-010`).
7. Zero AI spend (`NFR-015`); corpus disk ≤1 GB (`NFR-018`).
8. Secret-scan and output assertions clean (`NFR-019`).
9. Dependency lint passing; **contract suite green on both adapters of every port**.
10. `NFR-011` **benchmarked and replaced** with a measured target (`DEC-017`).

## 6. After Phase 1

| Phase | Adds | Trigger |
| --- | --- | --- |
| 2 | Cloudflare deployment (D1, R2, Queues, Workers) | pipeline proven locally |
| 3 | Live connectors at scale; GitHub resolution | `RSK-002` resolved |
| 4 | Deterministic security signals; sibling ingestion | `ETH-001` verified in implementation |
| 5 | Embeddings + semantic search | a real retrieval requirement |
| 6 | Capability engine + graph | search proven insufficient alone |
| 7 | Resolution + composition + master skills | graph populated |

**No phase begins because it is exciting. Each begins because the previous one proved a need.**
