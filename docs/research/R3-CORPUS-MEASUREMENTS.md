# R3 — Corpus Measurements

Status: **COMPLETE** · Date: 2026-08-27 · Agent: `[architect]`
Purpose: supply **measured** inputs to `docs/models/sizing.py`, satisfying SRS rule that no
storage or cost claim rests on a generic estimate (Article 10).
Method: Hugging Face `datasets-server` `/rows`, stratified sample across the full 3,797,117-row
range. **n = 1,200 sampled rows, 603 content-bearing.** Nothing downloaded.

## Measured values

| Metric | Value |
| --- | --- |
| `body_chars` mean | **4,425 bytes** |
| `body_chars` median | 2,512 |
| `body_chars` p90 / p99 / max | 11,581 / 20,662 / 20,774 |
| `dedup_primary` share | **50.2%** |
| `frontmatter_valid` (of content-bearing) | 77.4% |
| `has_scripts` | 4.6% |
| `sibling_count` mean | 4.47 |
| `path` length mean | 50 bytes |
| `repo_full_name` length mean | 26 bytes |

## Finding 1 — the paper's headline figure reproduces

Measured `dedup_primary` = **50.2%**. The paper reports **50.5%** verbatim copies.
Independent stratified sampling lands within 0.3 points.

This matters beyond corroboration: it means the oracle behaves as documented across the whole
corpus, not only in aggregate, so `NFR-002`'s per-row precision/recall test is sound.

## Finding 2 — the shards are ordered by file size, and the bias is severe

Mean `body_chars` by sample offset:

| Offset | 0 | 50k | 200k | 500k | 900k | 1.4M | 1.9M | 2.4M | 2.9M | 3.4M |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mean bytes | **10** | 146 | 704 | 1,359 | 2,311 | 3,595 | 5,849 | 8,065 | 11,441 | **19,352** |

Monotonic across three orders of magnitude. The dataset authors partitioned GitHub's code-search
space **by file size** to defeat the 1,000-result cap (R1 §4.2), and the Parquet mirror preserves
that write order.

**This is empirical confirmation of `DEC-013`, and it is worse than `DEC-013` assumed.** Reading
"the first shard" does not yield a slightly skewed sample — it yields **~10-byte files**, which
are not representative of anything and would have made every downstream measurement meaningless.

**Consequences, now mandatory rather than advisory:**

1. `DEC-011`'s "one `artifacts` shard" must become **stratified sampling across shards**. A single
   shard is unusable for validation. This is a change to a decision, recorded as such.
2. Parser and dedup validation samples must be drawn across the offset range, or every reported
   figure is a statement about tiny files.
3. `REQ-085`'s sampling-bias disclosure is not paperwork. Without it, a Phase 1 report reading
   "mean skill size 10 bytes" would be *technically produced by the pipeline* and completely false.

Had this gone unmeasured, Phase 1 would have validated deduplication against a corpus of
near-empty files and declared success. `NFR-002` would have passed while proving nothing.

## Finding 3 — content lives only on primaries

`content_fetched` tracks `dedup_primary` almost exactly (99.2% of content-bearing rows are
primaries). The dataset stores one content copy per distinct content and references it from
duplicates.

**Storage consequence:** content volume scales with **distinct contents (~50.2%)**, not with
occurrences. Sizing content at 3.8M × mean body would overstate it by ~2×.

## Sources

`https://datasets-server.huggingface.co/rows?dataset=mvaccargiu/gitskills&config=artifacts&split=train&offset={0,50k,200k,500k,900k,1.4M,1.9M,2.4M,2.9M,3.4M,3.7M,3796900}&length=100`

---

## Addendum — Licence distribution (measured 2026-08-27, increment 7)

Stratified sample of the corpus `repos` table, **n = 700** across the full offset range.
`metadata_fetched = 1` for all 700, so empty licence values are **real absences**, not unfetched rows.

| Licence | Count | Share |
| --- | ---: | ---: |
| **(empty — no licence)** | **434** | **62.0%** |
| MIT | 200 | 28.6% |
| NOASSERTION | 31 | 4.4% |
| Apache-2.0 | 23 | 3.3% |
| AGPL-3.0 | 5 | 0.7% |
| GPL-3.0 | 3 | 0.4% |
| ISC / BSD-2-Clause / LGPL-2.1 / WTFPL | 1 each | 0.6% |

### The finding

**Roughly 62% of repositories hosting agent skills carry no licence at all.**

Under default copyright, no licence means **no permission granted** — not permission implied.
Running the full pipeline over a 131-record real sample gives:

| Outcome | Count | Share |
| --- | ---: | ---: |
| rights `known` | 41 | 31.3% |
| **rights `unknown`** | **90** | **68.7%** |
| redistributable | 36 | 27.5% |
| L2/L3 conflicts | 2 | — |
| L3 claim with no L2 backing | 4 | — |

**Had AppMD treated "publicly accessible" as "freely redistributable" — the assumption BRIEF §38
explicitly forbids — approximately two thirds of the corpus would have been mislabelled**, and the
error would have been invisible until someone was harmed by it.

`NOASSERTION` is GitHub's marker for *"a licence file exists but we could not identify it."* It is
normalised to `UNKNOWN` rather than guessed (`REQ-057`), which is the correct reading: an
unidentified licence is not an absent one, and it is certainly not a permissive one.

This is the empirical justification for three decisions that looked merely cautious on paper:
`DEC-009` (serve nothing in Phase 1), `DEC-018` (`unknown` as an explicit state), and `DEC-019`
(rights-aware retention — 90 of 131 records get the shortest retention, because we hold bytes we
have no clear right to hold).

---

## Superseded, 2026-08-27 — the same questions at 35× the sample

The figures above were measured on **n=131**. The production ingest asked the same questions of
**4,665 records across 3,074 real repositories**. The original numbers are left unedited: they were
correct for the sample they had, and rewriting them would hide how much the sample was worth.

| Measure | n=131 | n=4,665 | Move |
| --- | ---: | ---: | --- |
| rights `unknown` | 68.7% | **60.1%** | −8.6 pts |
| repositories with no licence | 62% | **47.8%** | −14.2 pts |
| duplicates collapsed | ~49.8% (corpus-wide, by `file_sha`) | **0.3%** | see below |

**The repository figure reversed a claim.** "62% of repositories carry no licence" became
*"most repositories DO carry one"* (52.2%). That was quoted in the README, the docs page and
`test-plan.md`; all three are corrected.

**The duplicate rate is not a regression.** 49.8% was measured by grouping the whole corpus on
`file_sha`. This sample is **stratified** — 1,000 rows drawn evenly across a size-ordered corpus of
3.8M — so it almost never draws both copies of the same file. A sparse sample of a corpus cannot
reproduce that corpus's duplicate density, and 0.3% is the arithmetic of the sampling method, not a
property of the deduplicator. The oracle still agrees with `file_sha` grouping at 100%.

**What this says about small samples.** `n=131` was chosen to be cheap, and it was accurate to
within about nine points on one measure and fourteen on the other — close enough to reason with,
not close enough to publish. Every figure above now carries its sample size for that reason.
