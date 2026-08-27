# ARCHITECTURE

| | |
| --- | --- |
| Document | `ARCHITECTURE.md` v1.0 · Phase 02 · `[architect]` · 2026-08-27 |
| Depends on | `DATABASE.md` (`DEC-027`) |
| Satisfies | `REQ-001`, `REQ-008`, `NFR-027`–`NFR-029`, `NFR-031` |
| Governing | `DEC-021` — design for future scale, do not build it |

---

## 1. Purpose and shape

AppMD is a **modular monolith plus workers** (BRIEF §58), not microservices. One repository, one
deployable per runtime, module boundaries enforced by lint rather than by network calls.

The boundaries are drawn where the brief's subsystems are, so that extracting any one of them
later is a build-config change rather than a redesign. **We draw the lines now and cross the
network later, if ever.** Premature microservices would buy distribution costs today for an
independence we do not need until 100M+.

## 2. System context

```
   EXTERNAL                    APPMD                          CONSUMERS
   ┌──────────────┐
   │ GitSkills    │──corpus──┐
   │ (CC-BY-4.0)  │          │
   ├──────────────┤          ▼
   │ SkillsMP     │──API──→ ┌─────────────────────────┐
   │ (REST + MCP) │          │   BATCH RUNTIME         │
   ├──────────────┤          │   discovery → ingest    │──→ ┌──────────────┐
   │ GitHub       │──API──→ │   parse → normalise     │     │  CANONICAL   │
   │ (official)   │          │   fingerprint → dedup   │     │  STORE       │
   └──────────────┘          └─────────────────────────┘     │  (§DEC-027)  │
                                        │                     └──────┬───────┘
                             ┌──────────▼──────────┐                 │
                             │  OBJECT STORE       │                 │ derived,
                             │  raw bytes,         │                 │ rebuildable
                             │  rights-aware TTL   │                 ▼
                             └─────────────────────┘          ┌──────────────┐
                                                              │ SEARCH INDEX │
   ┌─────────────────────────┐                                └──────────────┘
   │   EDGE RUNTIME          │◄───────reads────────────────────────┘
   │   HTTP API /api/v1      │──────────────────────────────→  CLI · agents · future UI
   └─────────────────────────┘
```

## 3. Layering

```
  apps/            cli (batch)          api (edge)          ← composition roots ONLY
  ─────────────────────────────────────────────────────────
  ingestion/       pipeline stages                          ← imports ports only
  connectors/      SourceConnector implementations
  ─────────────────────────────────────────────────────────
  skill-core/      domain: CanonicalSkill, Occurrence,      ← NO I/O. NO SDK. Pure.
                   RightsPosture, Provenance, Licence
  ─────────────────────────────────────────────────────────
  ports/           CanonicalStore ObjectStore Queue
                   Cache Clock RateLimiter RobotsPolicy
  ─────────────────────────────────────────────────────────
  adapters/        sqlite d1 postgres | fs r2 |
                   local-queue cf-queue | memory-cache kv
```

**The dependency rule, enforced by lint (`NFR-028`):** arrows point downward only.
`skill-core` depends on nothing. `ingestion` and `connectors` depend on `ports` and `skill-core`.
Only `apps/` may name a concrete adapter.

**Why `skill-core` is pure:** rights computation, licence resolution and identity are the parts
most likely to be wrong and most expensive to get wrong. Pure functions over plain data are
testable without infrastructure, exhaustively, in milliseconds. Every rule in `LICENSING.md` is
a unit test with no database.

## 4. Two runtimes (`DATABASE.md` §7)

| | Batch runtime | Edge runtime |
| --- | --- | --- |
| Host | Node process → container | Cloudflare Workers |
| Owns | corpus connector, Parquet/DuckDB, bulk ingest, rebuild, backup | HTTP API, network fetch consumers, cron discovery |
| Phase 1 | **all of it** | API only, local via Wrangler |

Pipeline stages do not know which runtime they are in. **A stage that cannot run in both has a
leaked dependency** — that is the test, and it is checkable.

## 5. Subsystem map (BRIEF §5 → this architecture)

**Every Phase-1 subsystem names the increment that delivers it.** This column exists because its
absence caused both gate failures in Phase 1: `raw storage` and `SkillsMPConnector` were each
specified here and never assigned to an increment, so both were absent while every test passed
(`docs/retrospective.md` §2). The mapping is now checked mechanically by
`packages/tools/src/subsystem-coverage.js`.

| Brief subsystem | Module | Phase 1 | Increment |
| --- | --- | --- | --- |
| Source connectors | `connectors/` | ✅ | 3, 12 |
| Discovery engine | `ingestion/discovery` | ✅ | 3 |
| Ingestion queue / workers | `ports/Queue` + `ingestion/stages` | ✅ | 4 |
| Raw storage | `ports/ObjectStore` | ✅ | 11 |
| Parser / normaliser | `ingestion/parse`, `ingestion/normalise` | ✅ | 5 |
| Fingerprint / dedup | `skill-core/identity` | ✅ | 6 |
| Provenance | `skill-core/provenance` | ✅ | 7 |
| Licensing | `skill-core/rights` | ✅ | 7 |
| Canonical storage | `ports/CanonicalStore` | ✅ | 2 |
| Derived index rebuild | `ingestion/rebuild` | ✅ | 11 |
| Author removal | `ingestion/removal` | ✅ | 10 |
| Re-analysis | `ingestion/reanalysis` | ✅ | 10 |
| API / CLI | `apps/api`, `apps/cli` | ✅ | 8 |
| Security analysis | `ingestion/security` | ⚠ | deferred — deterministic signals only |
| AI understanding | — | ❌ | future |
| Capability engine | — | ❌ | future |
| Skill graph | — | ❌ | future |
| Vector index | — | ❌ | future |
| Search | `apps/api/search` | ⚠ | 11 — keyword only |
| Resolution / composition / master skills | — | ❌ | future |
| MCP | — | ❌ | future |

**Every ❌ has a seat at the table and no chair pulled out.** `skill-core` carries the `inferred`
compartment (SRS §6) so the AI subsystems write into a shape that already exists. Derived indexes
are rebuildable (`REQ-052`) so search and vector can be added without touching canonical.

## 6. Non-foreclosure inventory (`DEC-021`)

What Phase 1 does **not** build, and the single thing that keeps each buildable later:

| Future | Kept open by |
| --- | --- |
| AI understanding | `inferred` compartment + provenance already distinguishes inference from fact (`DOM-006`) |
| Capability engine | Capabilities are a many-to-many over canonical skills; no schema change needed |
| Skill graph | Relationship vocabulary already closed (`DOM-005`); edges are a table |
| Vector search | Derived index (`REQ-051`); embeddings key on `content_hash` |
| Composition / master skills | Read-side concerns over a correct index. Nothing in Phase 1 blocks them |
| Content redistribution | Rights posture computed per record (`REQ-059`); flipping the API is policy, not surgery |
| Horizontal scale | Cursor-only traversal (`NFR-032`), hash-prefix partitionability (`NFR-033`) |

## 7. Failure posture

| Failure | Consequence | Recovery |
| --- | --- | --- |
| A job fails | That job only (`REQ-022`) | Retry → DLQ (`DEC-025`) |
| Queue lost | In-flight jobs lost | Re-run discovery; idempotent (`REQ-016`) |
| Search index lost | Search degraded | Rebuild from canonical (`REQ-052`) |
| Object store lost | Reprocessing needs re-fetch | Canonical intact; `REQ-098` already assumes bytes are transient |
| **Canonical lost** | **Data loss** | **Restore from backup (`REQ-091`). The only store where this sentence is true** |
| Source unavailable | Discovery stalls | Circuit breaker; corpus path unaffected |
