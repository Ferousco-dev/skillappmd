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

---

## 7. Post-amendment results (2026-08-27, after `CR-006` / `DEC-036`)

### Extraction — batch-only, exempt

| | |
| --- | --- |
| Rows written | **10,000** |
| Shards touched | 0, 3, 7, 10, 13, 17, 20, 23, 27, 30 |
| Output | `data/corpus/artifacts-10k.jsonl`, 71.6 MB |
| **Peak RSS** | **1,887 MB** (exempt, `DEC-036`) |
| Duration | 900 s (~90 s per shard) |

Written incrementally, one shard open at a time, `free()` and `gc()` between shards. The extracted
corpus is never held in memory at either end.

### Ladder — pipeline, budget still binding

| Rung | Ingested | Canonical | Collapsed | Pipeline delta | ≤128 MB | Deterministic |
| ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| 100 | 48 | 48 | 0 | **24 MB** | YES | PASS |
| 1,000 | 461 | 461 | 0 | **21 MB** | YES | PASS |
| **10,000** | **4,678** | **4,665** | **13** | **85 MB** | **YES** | **PASS** |

Stratification at every rung: **10 strata, equal counts** (1000 each at the 10,000 rung).

### The dedup finding this rung existed to produce

Across 4,678 content-bearing real records:

- **4,678 distinct `content_hash` values — zero exact duplicates.**
- **4,665 distinct `normalised_hash` values — 13 near-duplicate groups.**

The corpus's own `file_sha` grouping also reports zero duplicates here. **AppMD found 13 duplicate
pairs that byte-identical hashing — including the corpus's own oracle — could not see.**

Two of them, with byte counts:

```
create-tldr-page/SKILL.md      Balkonsen/HA_AI_Gen_Workflow      6331 bytes
                               ComeOnOliver/skillshub            6332 bytes
shipping-and-launch/SKILL.md   Edz1k/edtaxi_frontend             9859 bytes
                               abdtirtayasa24/myworkflows-skills 9858 bytes
```

The same skill, in two unrelated repositories, differing by **one byte** — a trailing newline or
line ending. `content_hash` says different; `normalised_hash` says same.

**This is `DEC-012`'s two-tier design validated on real data, and it is the first measured evidence
that AppMD's deduplication is strictly better than the oracle it is graded against.** At 0.28% of
the sample it is not a large effect — but across 3.8M occurrences it is thousands of skills that
byte-hashing alone would have counted twice.

### Two harness flaws caught before they became evidence

1. **Sub-rungs sampled stratum 0 only.** The JSONL is written stratum by stratum, so taking the
   first *n* rows reproduced the exact head-sampling error `DEC-024` exists to prevent — this time
   introduced by the *file's* ordering rather than the corpus's. Fixed with a stride; all rungs now
   show even stratification.
2. **`rights unknown` read 100%**, which looks like a corpus finding and is not. The ladder passes
   `repoLicence: null` deliberately so it runs offline and reproducibly (`NFR-030`). The output now
   says **"100% BY CONSTRUCTION"**. Real licence resolution was measured in increment 7: 68.7%
   unknown against actual repository licences.
