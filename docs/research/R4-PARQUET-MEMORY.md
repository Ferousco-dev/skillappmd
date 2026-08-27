# R4 — Parquet Reading and the 128 MB Constraint

Status: **COMPLETE — blocking finding** · Date: 2026-08-27 · Agent: `[architect]`
Raised by: `CR-005` criterion 4 ("memory remains within the 128 MB constraint")

---

## 1. Finding

**The 10,000-record rung cannot read real corpus content within 128 MB. This is a property of the
corpus's Parquet layout, not of the library chosen.** Two independent readers were measured; both
exceed the budget by a wide margin.

## 2. The corpus layout that causes it

Measured from the real file footer (`artifacts/train/0000.parquet`, 200.1 MB):

| Property | Value |
| --- | --- |
| Rows in shard | 525,954 |
| **Row groups** | **1** |
| Row-group total size | 491.9 MB |
| **`content` column chunk** | **135.93 MB compressed · 322.78 MB raw** |
| All other columns combined | ~50 MB compressed |

**One row group per 200 MB shard.** Parquet's unit of independent access is the row group, so
"stream one row group at a time" — the design in `DEC-016` — degenerates to "read the whole shard".
Column projection helps but does not rescue it: the `content` chunk alone is 2.5× the budget when
decompressed, and a column chunk cannot be partially decoded.

## 3. Measurements

Baseline RSS subtracted. `artifacts/train/0000.parquet` over HTTPS with range support (verified 206).

| Reader | Operation | Peak RSS | Within 128 MB | Time |
| --- | --- | ---: | :--- | ---: |
| `parquet-wasm` 0.7.2 | `fromUrl` + metadata only | 97 MB | yes | ~2 s |
| `parquet-wasm` 0.7.2 | stream 6,000 rows **with** content | **1,067 MB** | **no** | 81 s |
| `parquet-wasm` 0.7.2 | stream 20,000 rows **without** content | **365 MB** | **no** | 8.8 s |
| `hyparquet` 1.29.2 + compressors | 1,000-row range **with** content | **568 MB** | **no** | 73 s |
| **AppMD ingestion pipeline** | **10,000 records end to end** | **106 MB (58 MB delta)** | **YES** | **951 ms** |

Two libraries, one WASM and one pure-JS with byte-range reads, differing by ~2× and both far over.
**The constraint is the data, not the reader.**

`parquet-wasm` also traps (`RuntimeError: unreachable`) when `read({rowGroups:[0]})` is called on a
shard of this size; `fromUrl` and `metadata()` are fine. Reported here as observed behaviour.

## 4. What this means for `NFR-014`

> `NFR-014` — Memory use per worker process shall stay ≤128 MB, matching the Workers isolate limit,
> so no design depends on headroom production will not have.

The measurement above splits cleanly into two things the requirement does not currently distinguish:

| | Peak | Runtime | Worker-compatible? |
| --- | ---: | --- | --- |
| **Ingestion pipeline** (parse → normalise → fingerprint → dedup → store) | **58 MB delta** | either | **yes** |
| **Corpus extraction** (Parquet decode) | 365–1,067 MB | batch only | **no, and never was** |

`DATABASE.md` §7 already established that the corpus connector **cannot run in a Worker** — no
filesystem, 128 MB isolate, no native modules. That was the two-runtime finding, recorded at G2.

**So applying the Workers isolate limit to the Parquet extractor is a category error in our own
SRS.** `NFR-014` exists so that *pipeline stages* stay Worker-compatible. The extractor is
architecturally excluded from Workers, and constraining it to a Workers limit constrains nothing
real while blocking work that is otherwise sound.

The pipeline — the part `NFR-014` is actually about — measures **58 MB at 10,000 records** and
passes comfortably.

## 5. Options

| # | Option | Memory | Cost |
| --- | --- | --- | --- |
| **A** | Split `NFR-014`: 128 MB binds pipeline stages and the edge runtime; the batch extractor gets its own measured budget (~1.2 GB) | pipeline 58 MB ✓ | a `CR` to amend `NFR-014` |
| **B** | Two-phase: a one-time offline extraction writes selected rows to `data/corpus/*.jsonl`, then the ladder runs against that within 128 MB | pipeline 58 MB ✓, extraction still ~1 GB but isolated and one-time | slightly more machinery; matches the two-runtime split |
| **C** | Run the 10,000 rung via the rows API (100 paged requests) | well under 128 MB | **breaks the `CR-002` trigger approved this session** |
| **D** | Cap the real-data ladder at 2,000 | ✓ | dedup breadth stays thin — the very thing the rung was for |

**Recommendation: A combined with B.** Amend `NFR-014` to say what it means — Worker-compatibility
of pipeline stages — and make extraction an explicit one-time batch step whose output the ladder
consumes. That satisfies every other `CR-005` criterion, keeps the honest 128 MB claim where it
belongs, and does not require breaking a rule approved an hour ago.

## 6. `CR-005` criteria status

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Deterministic byte-identical re-run | demonstrated at rungs 100 and 1,000; pending at 10,000 |
| 2 | Stratified sampling across size-ordered shards | implemented and demonstrated (`DEC-024`, `TC-060`, `TC-061`) |
| 3 | Dedup behaviour and oracle agreement | demonstrated at 1,000 (97.7% structural); breadth pending |
| 4 | **Memory within 128 MB** | **pipeline YES (58 MB); Parquet extraction NO — see §3, needs a ruling** |
| 5 | Failures classified retryable vs permanent | demonstrated (`TC-136`, `TC-137`; 422 permanent, 500/504 retried) |
| 6 | **Dependency isolated and replaceable** | **DONE** — quarantined by lint, proven to fail on a leak |
| 7 | All existing tests pass | **172 / 172** |

**Blocked on criterion 4 only.** Per the instruction not to proceed until the exit condition is
demonstrated with evidence, work stops here.
