# R2 — GitSkills Corpus: Schema and Minimal-Subset Strategy

Status: **COMPLETE** · Date: 2026-08-27 · Agent: `[architect]`
Answers user decision #3: *"determine the shards, inspect the schema, download only the minimum."*
Method: Hugging Face `datasets-server` API only. **Nothing was downloaded.**

---

## 1. Headline: the Parquet mirror is 13.4 GB, not 44.4 GB

| Config (table) | Parquet files | Size |
| --- | --- | --- |
| `artifacts` | 31 | **6.45 GB** |
| `artifact_siblings` | 45 | **6.96 GB** |
| `repos` | 1 | **0.02 GB** |
| `mining_runs` | 1 | ~0 GB |
| **Total** | **78** | **≈ 13.4 GB** |

The 44.4 GB figure is the **Zenodo SQLite** archive. The Hugging Face Parquet mirror
(`mvaccargiu/gitskills`) is columnar, sharded, and **individually addressable over HTTP**.

**Consequence:** we never download 44.4 GB, and we never download 13.4 GB either.
Phase 1 needs **`repos` in full (0.02 GB) plus one `artifacts` shard (~208 MB)**.
That is **~0.5% of the SQLite archive** and it is more than enough for the
100 → 1,000 → 10,000 ladder.

---

## 2. Verified schema

### `artifacts` — one row per SKILL.md occurrence (3,797,117 rows)

| Column | Type | AppMD use |
| --- | --- | --- |
| `repo_full_name` | string | **identity**: `owner/repo`, resolves to GitHub |
| `path` | string | **identity**: path within repo |
| `filename` | string | basename (`SKILL.md` and variants) |
| `location_class` | string | where in the tree it sits — classification signal |
| `file_sha` | string | **git blob SHA — the fingerprint input** |
| `discovered_at` | string | provenance timestamp |
| `content` | string | **full SKILL.md text** |
| `content_fetched` | int64 | 0/1 — content actually retrieved |
| `frontmatter_valid` | int64 | 0/1 — **parser oracle** |
| `name` | string | parsed frontmatter `name` |
| `description` | string | parsed frontmatter `description` |
| `body_chars` | int64 | body length |
| `dedup_primary` | int64 | **0/1 — their dedup verdict. Our validation oracle.** |
| `first_commit_at` / `last_commit_at` | string | **temporal intelligence (brief §34)** |
| `commit_count` | int64 | maintenance signal (brief §17) |
| `sibling_count` / `sibling_bytes` | int64 | folder weight |
| `has_scripts` | int64 | **0/1 — first-order security signal (brief §18)** |
| `has_references` | int64 | 0/1 |
| `content_sha_ok` | int64 | integrity check |
| `composition_truncated` | int64 | completeness flag |
| `first_commit_author` / `_type`, `last_commit_author` / `_type` | string | **anonymised** keyed codes |
| `first_commit_message`, `last_commit_message` | string | **redacted** of emails/names |

### `repos` — one row per repository (282,200 rows, 0.02 GB)

| Column | Type | AppMD use |
| --- | --- | --- |
| `full_name`, `owner` | string | identity + attribution |
| `stars`, `forks` | int64 | popularity signal — **never the sole ranking factor** (brief §17) |
| `is_fork` | int64 | **lineage input (brief §14)** |
| `language` | string | technology signal |
| **`license`** | string | **L2 repository licence — the redistribution authority (`DEC-006`)** |
| `description` | string | context for classification |
| `created_at`, `pushed_at` | string | freshness / maintenance |
| `metadata_fetched` | int64 | completeness flag |

### `artifact_siblings` — files beside each SKILL.md (7,264,865 rows)

`repo_full_name`, `artifact_path`, `entry_name`, `entry_type`, `entry_size`, `entry_sha`,
`content`, `content_fetched`, `skipped_reason`.

**This is where the scripts live.** Brief §18 (shell commands, credential access, network calls,
obfuscation) is largely a *sibling-file* analysis, not a SKILL.md analysis. Deferred past
Phase 1, but the table is why the security model must not assume the SKILL.md body is the
whole attack surface.

### `mining_runs` — their own discovery log

`run_id`, `artifact_type`, `query`, `started_at`, `finished_at`, `discovered`, `note`.
Contains the **actual search queries** behind the file-size partitioning strategy — a free
blueprint for our live `GitHubConnector`.

---

## 3. Why this schema is unusually good for us

1. **`content` is present.** Phase 1 needs no GitHub fetch at all for the corpus path. The
   fetch stage is still built and still exercised — by the live connectors on small batches —
   but the bulk corpus does not depend on it. Rate limits stop being a Phase 1 problem.
2. **`dedup_primary` is a published verdict on every row.** Combined with the paper's 50.5%
   verbatim-duplication figure, our deduplication engine has a **row-level oracle**, not just an
   aggregate target. We can compute precision and recall against it. `TC` cases in the test
   strategy bind to this.
3. **`frontmatter_valid` is a parser oracle.** Our parser's verdict must agree with theirs on
   valid/invalid, and every disagreement is a defect to explain — either theirs or ours.
4. **`repos.license` gives L2 directly for 282,200 repositories**, so the licence model can be
   populated and tested at scale on day one instead of being aspirational.
5. **Authors are already anonymised and messages redacted** by the dataset authors. Our
   confidentiality posture (Article 7, intake Q5) starts satisfied rather than needing retrofit.

---

## 4. Caveats carried forward

- `file_sha` is a **git blob SHA** (`sha1("blob <len>\0" + bytes)`), **not** a plain content
  hash. It is line-ending and whitespace sensitive. It is an exact-duplicate key only; it is
  **useless for near-duplicate detection**, which needs our own normalised fingerprint.
  → `DEC-012`.
- `dedup_primary` reflects **their** dedup policy, which is exact-content grouping. Where our
  near-duplicate detection diverges, that is expected and must be reported as a *difference*,
  not silently reconciled. Their figure validates our **exact** tier only.
- One `artifacts` shard is **not a random sample** — Parquet shards follow write order. For a
  statistically meaningful 10,000-skill batch, sample across shards or accept and **state** the
  bias. → `DEC-013`.
- Snapshot date 2026-08-10; decays (`RSK-008`).
- CC-BY-4.0 covers the compilation. `artifacts.content` remains under each repo's own licence.
  **The corpus being downloadable is not permission to serve its contents** (`DEC-006`, and
  user decision #1 makes this moot for Phase 1 by forbidding content serving outright).

---

## 5. Sources

- https://huggingface.co/datasets/mvaccargiu/gitskills
- `https://datasets-server.huggingface.co/splits?dataset=mvaccargiu/gitskills`
- `https://datasets-server.huggingface.co/parquet?dataset=mvaccargiu/gitskills`
- `https://datasets-server.huggingface.co/first-rows?dataset=mvaccargiu/gitskills&config=<c>&split=train`
- https://arxiv.org/html/2608.10906 · https://zenodo.org/doi/10.5281/zenodo.21875637
