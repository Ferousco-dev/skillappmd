# DATABASE ARCHITECTURE

| | |
| --- | --- |
| Document | `DATABASE.md` v1.0 |
| Phase | 02 Architecture · Owner `[architect]` |
| Date | 2026-08-27 |
| Resolves | `DEC-007` (canonical store undecided), `RSK-005` (→ `DEC-025`, CLOSED) |
| Satisfies | `REQ-050`–`REQ-055`, `REQ-091`, `REQ-094`, `NFR-010`, `NFR-027`–`NFR-029`, `NFR-031`–`NFR-034` |
| Inputs | `docs/SRS.md` v1.1 · R1 §6 (verified limits) · R3 (measured corpus) · `docs/models/sizing.py` |
| Governing | `DEC-021` — design for future scale, do not build it |

Every figure in §3–§6 is **computed** by `docs/models/sizing.py` from measured inputs (R3) and
Cloudflare public pricing fetched 2026-08-27. Re-run it to reproduce any number here.

---

## 1. The six stores, and what may never be confused with what

The single most common way an architecture like this rots is letting a convenient store become
the authoritative one. `REQ-051` forbids it; this section makes the boundary explicit.

| # | Store | Holds | Authoritative? | Rebuildable? |
| --- | --- | --- | --- | --- |
| 1 | **Canonical source of truth** | `CanonicalSkill`, `SkillOccurrence`, `Repository`, `Source`, `ProvenanceRecord`, `RightsPosture`, jobs, cursors | **YES — the only one** | No. **Backed up** (`REQ-091`, `NFR-035`) |
| 2 | **Object / blob storage** | raw `SKILL.md` bytes, keyed by content hash | No | From source, or not at all after `REQ-098` expiry |
| 3 | **Search index** | inverted index over canonical metadata | No | **Yes**, from #1 |
| 4 | **Vector index** | embeddings | No | **Yes**, from #1. *Not in Phase 1* |
| 5 | **Cache** | hot reads, computed rights postures | No | **Yes**, and may be dropped at any moment |
| 6 | **Queue state** | in-flight jobs | No | No — but it is *transient*, and loss costs a re-run, never data |

**Prohibitions, restating the user's rules 5–7 as architecture:**

- Canonical data shall not live in **Vectorize** (20M vectors/index, 1,536-dim, `topK ≤ 50` — a
  similarity structure, not a record store), **KV** (eventually consistent, no queries), **R2**
  (an object store; listing is not querying), or a **cache** (definitionally droppable).
- **R2 is object storage.** It stores bytes under a key. It is not a relational database and no
  query in this system shall depend on R2 `ListObjects`.
- **Vectorize is a disposable derived index.** If it vanishes, §3 rebuilds it. If it holds
  anything §1 cannot regenerate, that is a defect.

A useful test, applied to every future store proposal: **"if this were deleted right now, is any
information lost?"** If yes, it is canonical and needs backup. If no, it is derived and needs a
rebuild path. There is no third category, and "it would be slow to rebuild" is not one.

---

## 2. Workload characterisation

Ingestion and serving are different systems wearing one name (BRIEF §45).

### 2.1 Write workload — ingestion

| Property | Value |
| --- | --- |
| Shape | Bulk, batched, background, restartable |
| Volume per full corpus | 3.8M occurrence rows + 1.9M canonical + ~19M provenance ≈ **24.7M row writes** |
| Pattern | Insert-heavy, append-mostly; updates only on re-resolution |
| Latency need | **None.** No user waits. Hours are fine |
| Consistency need | Idempotent upsert on a deterministic key. **Eventual is acceptable** (BRIEF §46) |
| Concurrency | Bounded by ≤6 outgoing connections/worker (R1 §6.3) |
| Peak | Whatever we choose — we own the rate limiter |

### 2.2 Read workload — API

| Property | Value |
| --- | --- |
| Shape | Point lookups by id; cursor scans; keyword search |
| Volume | Low in Phase 1 (operator + CLI only) |
| Latency need | `NFR-012` ≤200 ms p95 |
| Hot path | `GET /skills/:id` + its provenance and rights — a **join across 4 tables**, or one document |

### 2.3 The three query shapes that decide the engine

1. **Dedup lookup** — `SELECT canonical_id WHERE content_hash = ?`, once per occurrence.
   High-cardinality unique index probe, **3.8M times per full ingest.** The hottest write-path read.
2. **Licence/rights query** — `WHERE rights.redistributable = false AND licence.l2 IS NULL`.
   Low-cardinality filters over large tables; needs partial or composite indexes.
3. **Cursor pagination** — `WHERE (sort_key, id) > (?, ?) ORDER BY sort_key, id LIMIT n`
   (`NFR-032`, `NFR-039`). Requires a **stable composite ordering index**. Every candidate engine
   supports this; the point is that offset pagination is forbidden, so the index must exist.

None of these needs joins across more than five tables. None needs a distributed transaction.
**Nothing in Phase 1 justifies distributed infrastructure** (`DEC-021`).

---

## 3. Storage model — computed from measured data

From R3: mean body **4,425 B**, primary share **50.2%**, and content lives **only on primaries**
(so content scales with distinct contents, not occurrences — sizing on occurrences overstates by ~2×).

| Occurrences | Canonical | Content (GB) | Occ rows | Canon rows | Provenance | **Relational total** | vs D1 10 GB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| 10,000 | 5,020 | 0.02 | 0.01 | 0.01 | 0.01 | **0.02** | OK |
| 100,000 | 50,200 | 0.22 | 0.06 | 0.06 | 0.09 | **0.20** | OK |
| 1,000,000 | 502,000 | 2.22 | 0.57 | 0.56 | 0.88 | **2.02** | OK |
| **3,797,117** *(full corpus)* | 1,906,153 | 8.43 | 2.16 | 2.13 | 3.35 | **7.65** | **OK — 23% headroom** |
| 10,000,000 | 5,020,000 | 22.21 | 5.70 | 5.62 | 8.84 | **20.15** | exceeds ×2 |
| 100,000,000 | 50,200,000 | 222.13 | 56.96 | 56.22 | 88.35 | **201.54** | exceeds ×20 |
| 1,000,000,000 | 502,000,000 | 2,221 | 570 | 562 | 884 | **2,015** | exceeds ×202 |

### 3.1 Answering rule 8 directly: is D1's 10 GB enough?

**Yes for Phase 1 and for the entire currently-known skill ecosystem. No beyond ~5M occurrences.**

> **The 10 GB ceiling is crossed at ≈ 4,961,893 occurrences in one database.**

The full GitSkills corpus — every `SKILL.md` known to exist on public GitHub as of 2026-08-10 —
is **3.8M occurrences at 7.65 GB.** It fits, with 23% headroom.

That is a genuinely surprising result and it deserves to be stated plainly rather than buried:
**a single D1 database can hold the entire known corpus.** The brief's framing (2.3M skills,
billion-scale ambition) invites the assumption that Cloudflare's storage primitives are
immediately inadequate. Measured against real data, they are not.

### 3.2 A design lever the arithmetic exposed

**Provenance is the largest single consumer: 3.35 GB of 7.65 GB — 44%.** That is a modelling
choice, not a fact: `PROV_FIELDS_PER_SKILL = 10` assumes one row per field origin.

Folding field-level provenance into a **JSON column on the canonical row** instead:

| Model | Full corpus | D1 ceiling reached at |
| --- | --- | --- |
| Provenance as rows (10/skill) | 7.65 GB | ~5.0M occurrences |
| Provenance as JSON column | **≈ 4.3 GB** | **≈ 8.8M occurrences** |

**Roughly doubles headroom.** Trade-off: JSON provenance cannot be indexed or queried per-field
without engine-specific JSON indexing. Since `REQ-040` requires provenance to be *recorded and
retrievable*, not *queried across records*, the JSON model satisfies the requirement.

**Adopted as `DEC-026`**, with the row model retained as the migration target if per-field
provenance querying ever becomes a requirement.

---

## 4. Cost model — computed, Cloudflare Workers Paid, USD

Prices verified 2026-08-27: D1 writes **$1.00/M rows** (50M/mo included), reads **$0.001/M**
(25B/mo included), storage **$0.75/GB-mo** (5 GB included). Queues **$0.40/M operations**
(1M/mo included), one operation per 64 KB written/read/deleted, **retries and DLQ writes count**.
R2 storage **$0.015/GB-mo** (10 GB free), Class A **$4.50/M** (1M free), egress **free**.

| Occurrences | D1 writes | D1 store/mo | Queue ×9 | Queue ×4 | R2 puts | R2 store/mo | **Ingest** | **Monthly** |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | **$0.00** | **$0.00** |
| 100,000 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | **$0.00** | **$0.00** |
| 1,000,000 | 0.00 | 0.00 | 3.20 | 1.20 | 0.00 | 0.00 | **$3.20** | **$0.00** |
| **3,797,117** | 0.00 | 1.99 | 13.27 | 5.68 | 4.08 | 0.00 | **$17.35** | **$1.99** |
| 10,000,000 | 15.22 | 11.37 | 35.60 | 15.60 | 18.09 | 0.18 | **$68.91** | **$11.55** |
| 100,000,000 | 602.20 | 147.40 | 359.60 | 159.60 | 221.40 | 3.18 | **$1,183.20** | **$150.58** |
| 1,000,000,000 | 6,472.00 | 1,507.77 | 3,599.60 | 1,599.60 | 2,254.50 | 33.17 | **$12,326.10** | **$1,540.94** |

*Excludes the Workers Paid base ($5/mo) and compute. Ingest is one-time per full corpus pass.*

### 4.1 Findings

1. **Ingesting the entire known skill ecosystem costs about $17 once, then $2/month.** The economic
   objection to this project does not exist at current scale.
2. **The 9-messages-per-occurrence design costs $3.20 at 1M and $359.60 at 100M.** Collapsing the
   four deterministic adjacent stages (parse → normalise → fingerprint → dedup, which share a
   failure mode and have no independent retry value) to one message saves **$200 per full ingest
   at 100M**. Recommended in `QUEUE_MODEL.md`; **not** adopted in Phase 1, where the difference is
   $0 and per-stage observability is worth more than nothing.
3. **D1 row-writes dominate at scale** ($6,472 at 1B) — because provenance multiplies writes 10×.
   `DEC-026`'s JSON provenance removes ~19M writes per full corpus, cutting that line by ~77%.
4. **Retries and DLQ writes are billable Queue operations.** A retry storm is a cost incident, not
   only a reliability one. `REQ-019`'s bounded attempts and `REQ-025`'s circuit breaker are cost
   controls as much as stability controls.
5. Even at **1B occurrences the bill is ~$1,541/month** — real, but not the barrier the brief's
   framing implies. The barrier at 1B is **operational complexity, not cost**: 202 D1 databases.

---

## 5. Engine comparison

Assessed against §2's workload, not against reputation.

### 5.1 Cloudflare D1

| Dimension | Assessment |
| --- | --- |
| Phase 1 (10k) | **Excellent.** Zero cost, zero ops |
| 1M | **Good.** 2.02 GB, $3.20 ingest |
| 3.8M (full corpus) | **Adequate.** 7.65 GB of 10 GB — or **4.3 GB with `DEC-026`** |
| 10M | **Fails** in one database. Needs sharding |
| 100M / 1B | **Fails.** 21 / 202 databases, application-level routing |
| Dedup lookup | Fine. SQLite unique indexes are fast at these cardinalities |
| Cursor pagination | Native |
| Licensing queries | Partial indexes supported |
| **Write throughput** | **Weak point.** 100 bound parameters/query caps batch inserts at ~10–25 rows/statement. A bulk load becomes many small statements |
| Backup/recovery | Time Travel 30 days (paid) + export. `RTO ≤ 4 h` achievable |
| Migrations | Wrangler migrations; SQLite `ALTER TABLE` is limited (no drop-column pre-3.35, no type change) |
| Cost | Cheapest by a wide margin |
| Ops complexity | **Lowest.** No servers, no connection pooling |
| CF integration | Native binding, no egress |
| **Portability** | **Highest — it is SQLite.** The local adapter and production adapter share a dialect. This is the single strongest argument in D1's favour |
| Sharding | Possible (50k databases) but **application-level and manual** |

### 5.2 PostgreSQL (Neon / Supabase / self-hosted)

| Dimension | Assessment |
| --- | --- |
| Phase 1 → 10M | **Excellent** throughout. No size cliff |
| 100M / 1B | **Good** with partitioning (declarative, native) and read replicas |
| Dedup lookup | Excellent. B-tree or hash index; partial indexes |
| **Write throughput** | **Strong.** `COPY`, multi-row `INSERT`, no parameter cliff |
| Licensing queries | Excellent — partial, expression, GIN indexes |
| Cursor pagination | Native, with `ROW()` comparison |
| Provenance | **JSONB with GIN indexing** — gets `DEC-026`'s size win *and* per-field queryability. Neither other candidate offers both |
| Backup/recovery | Mature: PITR, `pg_dump`, streaming replication |
| Migrations | Best-in-class. Transactional DDL — a failed migration rolls back |
| **Future subsystems** | **pgvector** (vector index), **tsvector/GIN** (search), **recursive CTEs** (graph — BRIEF §64 asks whether relational graph modelling suffices; it does at our scale). **One engine could serve canonical + search + vector + graph** |
| Cost | Free tiers exist (Neon, Supabase). Paid ~$20–60/mo at our scale |
| Ops complexity | **Higher.** Connection management from Workers needs Hyperdrive or an HTTP driver |
| CF integration | Via Hyperdrive; adds a component and a dependency |
| Portability | High — standard SQL, many hosts |

### 5.3 MongoDB

| Dimension | Assessment |
| --- | --- |
| Document fit | **Genuinely good.** The canonical skill (§6 of SRS) is a nested document: `declared`, `inferred`, `licence` ×3, `rights`, `retention`, `provenance`. Storing it as one document removes the 4-table join on the hot read path |
| Schema evolution | **Strongest.** `REQ-094` migration is easier when documents are self-describing with `schema_version` |
| Write throughput | Strong. Bulk writes, no parameter cliff |
| Dedup lookup | Excellent — unique index on `content_hash` |
| Scale | Excellent. Native sharding is the best of the three |
| Cursor pagination | Native |
| Licensing queries | Good — compound and partial indexes |
| Backup/recovery | Mature (Atlas) |
| **Weaknesses** | Atlas free tier **512 MB** — too small even for 1M occurrences (2.02 GB). First real tier ~$57/mo. **No Cloudflare integration.** Weaker relational integrity for `traceability` and occurrence↔canonical↔repository joins. **No local-dev parity** with any Cloudflare primitive |
| Portability | Moderate — query language is not SQL, so a later move is a rewrite, not a port |

### 5.4 Considered and rejected

| Option | Why rejected |
| --- | --- |
| **Durable Objects as canonical** | A DO is a consistency primitive, not a database. Millions of DOs to hold millions of skills is an architecture, not a storage layer. Also the worst lock-in in the Cloudflare catalogue |
| **KV as canonical** | Eventually consistent, no queries, no secondary indexes. Violates `REQ-051`, rule 5 |
| **R2 as canonical** | Object storage. `ListObjects` is not a query. Violates rule 6 |
| **Vectorize as canonical** | Disposable derived index by definition. Violates rule 7 |
| **SQLite (local file) in production** | Correct for Phase 1 local; single-writer and no network access make it wrong for a deployed API |
| **ClickHouse / DuckDB** | Excellent analytically, wrong shape for point lookups and per-record updates. **DuckDB is, however, the right tool for reading Parquet in the batch runtime** — see §7 |

---

## 6. Decision

### `DEC-027` — Canonical store: SQLite locally, D1 in production, PostgreSQL at the migration trigger

| Stage | Canonical store | Rationale |
| --- | --- | --- |
| **Phase 1, local** | **SQLite** | Zero cost, zero accounts, zero network. Same dialect as D1, so the production move is a driver swap |
| **Phase 1–2, production** | **Cloudflare D1** | Holds the full known corpus (7.65 GB, or 4.3 GB with `DEC-026`) at ~$2/mo. Native binding, no egress, no pooling |
| **Beyond ~4M occurrences** | **PostgreSQL** | Before the 10 GB cliff at ~5.0M (or ~8.8M with `DEC-026`) |

**Migration trigger — whichever comes first:**

1. Canonical relational size **> 7 GB** (70% of the D1 ceiling), or
2. A requirement lands that needs **vector, full-text, or graph** in the same engine (pgvector /
   tsvector / recursive CTE), or
3. Write throughput becomes the ingestion bottleneck due to the **100-bound-parameter** cap.

**Explicitly rejected: sharding D1 across many databases.** Technically available (50k databases,
1 TB/account) and the wrong answer. It buys capacity by taking on application-level shard routing,
cross-shard queries, per-shard migrations and per-shard backups — real distributed-systems
complexity, adopted permanently, to defer a migration we can perform once. `DEC-021` decides this:
that is *building* future scale, not designing for it. **Migrating to Postgres is the cheaper path
and it is a single event.**

**Why not start on PostgreSQL?** Defensible, and I considered it. Against: it costs an account, a
connection story from Workers (Hyperdrive), and ops burden — for capacity Phase 1 will not use for
years of ingestion. `DEC-021` again: cheap, understandable, replaceable now.

The migration is affordable **only because `NFR-027`/`NFR-028` are enforced**. If domain logic
imports a SQL driver, this decision is a trap instead of a plan. §8 is what makes it a plan.

### `DEC-026` — Provenance stored as a JSON column, not as rows

Cuts the full corpus from 7.65 GB → ~4.3 GB and roughly doubles D1 headroom (~5.0M → ~8.8M).
`REQ-040` requires provenance to be recorded and retrievable, not queried across records.
Row-per-origin remains the migration target if per-field provenance querying is ever required —
and PostgreSQL's JSONB+GIN would supply it without changing the storage shape.

---

## 7. The two runtimes (rule 14)

`REQ-003` reads Parquet. Workers has no filesystem, a 128 MB isolate, and no native modules.
**These do not fit together, and pretending otherwise would produce an architecture that cannot
be built.**

| | **Batch runtime** | **Edge runtime** |
| --- | --- | --- |
| Host | Local process (Node), later a container | Cloudflare Workers |
| Runs | Corpus connector, Parquet reading, bulk ingestion, index rebuild, backup/restore | HTTP API, queue consumers for network fetch, cron discovery |
| Storage access | Canonical store via driver; object store via filesystem/S3 API | Canonical via binding; R2 via binding |
| Why | Parquet needs a real filesystem, real memory and **DuckDB** — none available in a Worker | Needs edge latency, native bindings, no cold-start ceremony |
| Phase 1 | **This is the whole of Phase 1** | API only; deployed later |

**Both runtimes consume the same ports (§8).** The pipeline stages do not know which runtime they
are in. A stage that cannot run in both is a stage with a leaked dependency.

This is not a compromise. Cloudflare Workers is a request-response runtime; bulk Parquet
processing is a batch job. **They are different workloads and deserve different runtimes** — which
is exactly what rule 14 anticipated.

---

## 8. Replaceability (rule 12)

```
packages/
  skill-core/        domain types, canonical model, rights logic   ← NO I/O, NO SDK
  ports/             interfaces only:
                       CanonicalStore  ObjectStore  Queue  Cache  Clock  RateLimiter
  adapters/
    sqlite/          CanonicalStore  (Phase 1, local)
    d1/              CanonicalStore  (production)
    postgres/        CanonicalStore  (migration target)
    fs/              ObjectStore     (local)
    r2/              ObjectStore     (production)
    local-queue/     Queue           (SQLite-backed, local)
    cf-queue/        Queue           (production, DLQ mandatory — DEC-025)
  ingestion/         pipeline stages ← import ports ONLY
  connectors/        SourceConnector implementations
apps/
  cli/               batch runtime entry
  api/               edge runtime entry
```

**Rules, enforced not encouraged:**

1. `skill-core` and `ingestion` import from `ports/` only. **Never** an adapter, **never** a vendor SDK.
2. Enforced by a **dependency-direction lint rule** (`NFR-028`) that fails the build. Review
   discipline decays; a failing build does not.
3. Every port has **≥2 adapters**, one requiring no cloud account (`NFR-027`).
4. Adapters are selected by configuration at composition root. No `if (production)` in logic.
5. The `CanonicalStore` port speaks in **domain terms** — `findByContentHash`, `upsertOccurrence`,
   `cursorScan` — never SQL. A port that leaks SQL is a port that cannot be implemented by Mongo.

**Falsifiable test of this section:** the Postgres adapter can be written, and the full test suite
pass against it, **without editing one line in `skill-core/` or `ingestion/`.** If that is not
true, §8 has failed and `DEC-027`'s migration path is fiction. This becomes a G4 criterion.

---

## 9. Bottlenecks (rule 11)

| Scale | First binding constraint | Evidence | Mitigation |
| --- | --- | --- | --- |
| **10k–1M** | None. 2.02 GB, $3.20 | §3, §4 | — |
| **~4M** | **D1 storage ceiling approaching** (7 GB trigger) | §3.1 | `DEC-026`, then migrate |
| **~5.0M** (8.8M with `DEC-026`) | **D1 10 GB hard ceiling** | computed | PostgreSQL (`DEC-027`) |
| **~10M** | Full index rebuild (`REQ-052`) becomes hours | `NFR-034` | Incremental rebuild; not Phase 1 |
| **~10M** | Keyword search (`REQ-069`) outgrows SQLite FTS | §5.2 | Postgres tsvector, or a dedicated search index |
| **~20M** | Vectorize 20M/index ceiling | R1 §6.4 | Index sharding + routing. Not Phase 1 |
| **~100M** | Single-writer canonical path (`REQ-051`) | §2.1 | Partition by `content_hash` prefix (`NFR-033`) |
| **1B** | **Operational complexity, not cost** ($1,541/mo) | §4 | Partitioned Postgres or a distributed store. A deliberate future decision, not a Phase 1 concern |

**`NFR-034` is satisfied by this table.** The next constraint at each milestone is named, with the
evidence that produced it.

---

## 10. Backup, migration, integrity

**Backup (`REQ-091`, `NFR-035`, `DEC-022`).** RPO ≤24 h, RTO ≤4 h. Phase 1: periodic full snapshot
(SQLite file copy / D1 export) with schema version, plus a **verified restore** — restore to a
scratch location, assert record count and content-hash digest match. A restore procedure never
executed is a document, not a capability.

**Migration (`REQ-094`).** Every record carries `schema_version`. Forward migrations are
re-runnable, record which records they touched, and **fail rather than drop a field**.
Known constraint: **SQLite/D1 have limited `ALTER TABLE`** — some changes need table rebuild +
copy. PostgreSQL's transactional DDL is materially better and is a secondary argument for `DEC-027`'s
migration target.

**Integrity (`NFR-010`, BRIEF §62).** Derived indexes are droppable and rebuildable from canonical.
Canonical is the only backed-up store. After tombstoning (`DEC-015`), a rebuild is *equivalent
minus tombstoned records*, and the report states that count rather than claiming an identical index.

---

## 11. Open items and assumptions

| ID | Status |
| --- | --- |
| `DEC-025` | **CLOSED** — Queues DLQ native, at-least-once, ordering **UNVERIFIED** (assume none) |
| `DEC-026` | **ASSUMPTION** — JSON provenance sufficient. Reverses if per-field provenance querying becomes a requirement |
| `DEC-027` | **DECIDED** — migration trigger is a measured threshold, not a feeling |
| Row-size model | **ASSUMPTION** — `OCC_ROW`/`CANON_ROW`/`PROV_ROW` estimated with a 1.6× index factor. **Measure against the real schema at Phase 1 and correct this document** |
| Queue ordering | **UNVERIFIED** — no stage may assume ordering |
| D1 write throughput | **UNVERIFIED** — the 100-bound-parameter cap's practical effect on bulk load is not benchmarked. Benchmark in Phase 1 |

---

## 12. Sources

Cloudflare (fetched 2026-08-27): `/d1/platform/{limits,pricing}`, `/queues/platform/{limits,pricing}`,
`/queues/configuration/dead-letter-queues/`, `/queues/reference/delivery-guarantees/`,
`/workers/platform/limits/`, `/vectorize/platform/limits/`, `/r2/pricing/`.
Corpus: `docs/research/R3-CORPUS-MEASUREMENTS.md`. Model: `docs/models/sizing.py`.
