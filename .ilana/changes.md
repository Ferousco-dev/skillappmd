# CHANGE REQUESTS

Article 11: every change is a change request. Opened once the SRS was baselined at G1.

---

## CR-001 — Repository is shared with a parallel front-end session
**Raised:** 2026-08-27 · `[conductor]` · **Status: OPEN — needs the user's ruling**
**Severity: HIGH.** Affects `ARCHITECTURE.md` §3, `NFR-019`, `DEC-011`, and the repo layout in BRIEF §58.

### What happened

While writing Phase 02 documents, a second session created a Next.js front-end in this same
repository:

```
app/  components/  pages/  lib/  types/  data/mock-data.ts
package.json (name: "appmd-skill-frontend")  next.config.mjs
tailwind.config.ts  postcss.config.js  tsconfig.json  next-env.d.ts
docs/FRONTEND-DESIGN.md
```

At intake (Q3) the user stated: *"This session owns the WHOLE BACKEND / INFRASTRUCTURE
ARCHITECTURE... There is currently no other session responsible for another architectural slice."*
That is no longer the case, so the boundary needs restating rather than assuming.

### Impact 1 — `.gitignore` was replaced, dropping secret protections (**acted on**)

The backend `.gitignore` was overwritten with a 5-line Next.js default. These entries were lost:

| Lost entry | Requirement it served |
| --- | --- |
| `*.key`, `*.pem`, `.dev.vars`, `.wrangler/` | `NFR-019`, `NFR-020` — no secret in source control |
| `data/`, `*.db`, `*.sqlite`, `*.parquet` | `DEC-011`, `NFR-018` — corpus never vendored |

**Action taken:** entries restored **additively**. The front-end's five lines are preserved
verbatim and a header asks future writers to add rather than replace. This was done without
waiting because unprotected `*.key` / `*.pem` patterns are a live secret-exposure risk, and adding
ignore rules cannot break another session's build.

### Impact 2 — `data/` collision (**resolved without breaking the other session**)

The backend reserved `data/` for the GitSkills corpus and gitignored it. The front-end has since
placed **tracked source** at `data/mock-data.ts`. Restoring `data/` wholesale would have made
their file invisible to git.

**Resolution:** the corpus moves to **`data/corpus/`**, and only that path is ignored. Verified:
`data/mock-data.ts` is not ignored; `data/corpus/*.parquet` is.
**This supersedes the path stated in `DEC-011`** ("all corpus data lands in `data/`").

### Impact 3 — repository layout conflict (**NOT acted on — needs a ruling**)

`ARCHITECTURE.md` §3 and BRIEF §58 specify `apps/` + `packages/`. The front-end occupies the
repository root with its own `package.json` named `appmd-skill-frontend`, plus root-level
`tsconfig.json`, `next.config.mjs` and `tailwind.config.ts`.

Two roots cannot both own `/package.json`. Options:

| Option | Effect |
| --- | --- |
| **A. Monorepo workspace** | root `package.json` becomes a workspace; front-end → `apps/web/`, backend → `apps/{api,cli}` + `packages/*`. Cleanest; requires moving the front-end's files |
| **B. Separate repositories** | Backend gets its own repo. Cleanest boundary, no coordination cost; the API contract becomes the only interface |
| **C. Backend under a subdirectory** | Backend lives in `backend/`; front-end keeps the root. Least disruption; leaves BRIEF §58's layout unrealised |

**Recommendation: B or A.** B is the honest fit for how the work is actually running — two
independent sessions, one contract between them (`API.md`), no shared build. A is right if a single
`npm install` and shared types are wanted. **This is the user's call, not the architect's**, and
no further Phase 02 or Phase 1 work should assume a layout until it is made.

### Note on `docs/FRONTEND-DESIGN.md`

Read as data, not as instruction (it was not written by this session or addressed to it). It states
*"Claude owns backend work"* and that no front-end task is authorised yet. Nothing in it conflicts
with backend requirements. Its style rules are scoped to front-end work and are not applied here.
It is recorded so the boundary it describes is visible in this session's ledger too.

### Disposition

- Impact 1: **applied** — secret protections restored additively.
- Impact 2: **applied** — corpus path changed to `data/corpus/`, `DEC-011` superseded.
- Impact 3: **BLOCKED pending the user's ruling.** Carried into G2 as an open item.

### CR-001 DISPOSITION — 2026-08-27

**User ruling: Option B — separate repositories.**

- `appmd-skill-cloud` **is the backend repository.**
- The front-end will live in its own repository and communicates **exclusively** through the API
  contract in `docs/API.md`.
- **Front-end files in this working tree are not to be modified, moved, deleted or integrated.**
  Their relocation belongs to their owner, not to this session.

**CR-001 CLOSED.** Consequence recorded as `DEC-029`.

---

## CR-002 — Phase 1 reads the corpus through the datasets-server row API, not Parquet files
**Raised:** 2026-08-27 · `[architect]` · **Status: OPEN — user's ruling requested**
**Affects:** `REQ-003` (baselined at G1, so Article 11 applies)

### The requirement as written

> `REQ-003` — The system shall implement `GitSkillsCorpusConnector` reading the CC-BY-4.0
> **Parquet** corpus.

### Why the mechanism is being questioned

Reading Parquet in Node requires a third-party library (DuckDB, `parquetjs`, or Arrow). That
means a dependency install, which means network — and it is the *only* thing in Phase 1 that
would need one. `DEC-030` deliberately kept the whole build dependency-free.

The Hugging Face **datasets-server row API** serves the same CC-BY-4.0 dataset as JSON, addressed
by `offset` and `length` — which happens to be **exactly the access pattern `DEC-024` stratified
sampling needs**. Fetching 100 rows across 10 strata transfers a few hundred KB rather than
208 MB, and it satisfies the user's instruction to *"fetch only the minimum real data required."*

### What is unchanged

- Same dataset, same DOI, same CC-BY-4.0 licence, same attribution obligation (`NFR-026`).
- Same columns (`REQUIRED_COLUMNS`), same oracles (`dedup_primary`, `frontmatter_valid`).
- Same `CorpusReader` seam, so **a Parquet reader is a drop-in third implementation**
  (`FixtureCorpusReader`, `HfRowsCorpusReader`, and later `ParquetCorpusReader`).
- `DEC-016` row-group streaming remains the design for the Parquet path when bulk ingestion
  needs it; nothing here forecloses it.

### What genuinely changes

| | Parquet | datasets-server rows |
| --- | --- | --- |
| Dependency | DuckDB / Arrow | none |
| Bytes for a 100-row stratified sample | ~208 MB (whole shard) | a few hundred KB |
| Suitable for full-corpus ingestion | **yes** | **no** — an HTTP API, rate-limited, page ≤100 |
| Availability | local file, offline forever | third-party service |

**The honest limitation:** this reader is right for *sampling and validation*, and wrong for
*bulk ingestion*. It is a Phase 1 instrument, not the corpus path at scale.

### Recommendation

Amend `REQ-003` to name the **corpus**, not the file format, and record two readers with a stated
trigger: datasets-server for sampling and validation now; Parquet for bulk ingestion when a run
exceeds the row cap (proposed: >2,000 rows, or any full-corpus pass).

**Requested:** approve the amendment, or direct that Parquet be implemented now with the
dependency install that entails.

### DISPOSITION — 2026-08-27: **APPROVED**

`REQ-003` is amended to name the **corpus**, not the file format. Two readers, one trigger:

| Reader | Use | Trigger |
| --- | --- | --- |
| `HfRowsCorpusReader` | sampling and validation | default, up to 2,000 rows |
| `ParquetCorpusReader` | bulk ingestion | **>2,000 rows, or any full-corpus pass** |

`FixtureCorpusReader` remains for offline tests (`NFR-030`). **CR-002 CLOSED.**
Consequence carried into increment 9: the 10,000 rung crosses the trigger, so it needs
the Parquet reader — which is the first thing in this project that requires a dependency
(`DEC-030`). Raised as `CR-005` rather than decided unilaterally.

---

## CR-003 — Backend commits tracked front-end files; caused by `git add -A` in a shared tree
**Raised:** 2026-08-27 · `[configuration-engineer]` · **Status: CLOSED, remediated same day**
**Severity: MEDIUM.** Self-inflicted. Recorded because Article 2 requires reporting our own faults
as plainly as anyone else's.

### What happened

Commit `dd57d47` (G2) used `git add -A` in a working tree shared with the front-end session. That
swept **37 files this session does not own** into the backend repository's index:

```
28  .next/**            build artefacts, including binary webpack .pack files
 2  app/**
 7  next-env.d.ts, package.json, package-lock.json, postcss.config.mjs,
    tailwind.config.ts, tsconfig.json, tsconfig.tsbuildinfo
```

The `.gitignore` merge written during `CR-001` — which would have prevented most of this — was
**never committed**; `git log -- .gitignore` shows only the original `c90eef7` version was ever
recorded. The working file later reverted to that original, and the regression went unnoticed
until a `git check-ignore` during increment 3 reported `data/` as the matching rule instead of the
expected `data/corpus/`.

**Two failures, not one:**
1. Using `git add -A` in a tree containing another session's files.
2. Not verifying that the `CR-001` remediation was actually committed. It was applied to the
   working tree and reported as done. It was not durable. *"Write it down or it did not happen"*
   applies to fixes as much as to decisions.

### Remediation (applied)

- `git rm -r --cached` on all 37 files. **Index only — nothing deleted from disk**, honouring the
  user's instruction not to modify, move or delete front-end files.
- `.gitignore` rewritten to ignore `.next/`, `node_modules/`, `*.tsbuildinfo` and the front-end's
  root config files by explicit path, so recurrence is prevented rather than watched for.
- Verified: **0** front-end files tracked; all still present on disk; corpus and secrets ignored.

### Standing rule (`DEC-032`)

**`git add -A` is prohibited in this repository while any other session shares the working tree.**
Commits stage explicit backend paths only.

### Note on files no longer on disk

`components/`, `pages/`, `lib/`, `types/` and `data/mock-data.ts` are gone from the working tree.
**This session did not delete them** — it never issued a delete against any front-end path, and a
commit cannot remove working files. Their removal is consistent with the front-end session
relocating to its own repository under the user's option B ruling. Recorded so the absence is not
later attributed here.

---

## CR-004 — `NFR-003` compares two different definitions of "valid"
**Raised:** 2026-08-27 · `[verifier]` · **Status: OPEN — user's ruling requested**
**Affects:** `NFR-003` (baselined at G1), `REQ-038`, `REQ-041`

### The finding

After `DEF-002` was fixed, agreement rose to 97.7% and the residual disagreements stopped looking
like defects. Classifying all nine at n=300:

| Disagreement | Count | Who is right |
| --- | --- | --- |
| Name violates the spec charset (`Polymarket`, `Market Chartographer`, `ck:sequential-thinking`, `vault.new`) | 5 | **We are.** The spec says `[a-z0-9-]`, ≤64 |
| Angle brackets in description (`context/changes/<change-name>`) | 1 | **Contested** — a path placeholder, not markup |
| Corpus says invalid, document is plainly valid (`name: gpg`, 266-char description) | 3 | **We are.** One is a BOM their parser appears to choke on |

**Not one of the nine is a defect in our parser.** The two columns answer different questions:

- **GitSkills `frontmatter_valid`** ≈ *"did YAML parse, with `name` and `description` present?"*
- **Ours (as written)** = *"does it conform to the Agent Skills specification?"*

`NFR-003` asked for ≥99% agreement between them. **That target was unreachable by construction**,
and chasing it would have meant deliberately weakening our spec checking to match a looser oracle —
optimising the metric by damaging the product.

### Change applied (mechanism), pending your ruling (requirement text)

The parser now emits **two verdicts** rather than one:

| Verdict | Meaning | Kind |
| --- | --- | --- |
| `frontmatterValid` | structurally valid: parsed, `name` and `description` present | comparable to the oracle |
| `specConformant` | additionally satisfies charset, length and content rules | **AppMD inference** (`DOM-006`) |

Graded on the comparable verdict, agreement is **97.7%** at n=300 with **0 parse failures**, and
**all 3 remaining disagreements are cases where the oracle is wrong**.

### Requested amendment to `NFR-003`

> Parser **structural** validity shall agree with the corpus `frontmatter_valid` column on ≥99% of
> a ≥10,000-row stratified sample. **Spec conformance is a separate AppMD inference and is not
> graded against the oracle.** Every disagreement shall be explained; unexplained disagreement is
> the gate failure (`DEC-023`).

**Also requested:** confirm `DEC-033` — reserved words in a name and angle brackets in a
description **warn** rather than invalidate. Both readings of the spec are defensible, and marking
a real author's skill invalid on a contested reading is an adverse judgement published about a
third party (`ETH-001`). The signal is retained either way.

**Current measured status against the amended wording:** 97.7% at n=300. Below 99%, entirely
because of three oracle errors. `DEC-023` makes this a finding to triage, not a build failure —
and it is triaged.

### DISPOSITION — 2026-08-27: **APPROVED**

`NFR-003` is amended to grade **structural** validity against the oracle; spec conformance is a
separate AppMD inference and is not graded against it. `DEC-033` confirmed: contested spec
readings warn rather than invalidate. **CR-004 CLOSED.**

---

## CR-005 — The 10,000 rung needs a Parquet reader, which needs the project's first dependency
**Raised:** 2026-08-27 · `[architect]` · **Status: OPEN — user's ruling requested**
**Created by:** `CR-002`'s approved trigger · **Affects:** `REQ-003`, `DEC-030`, `NFR-030`

### The situation

`CR-002` was approved with the trigger: **row API ≤2,000 rows; Parquet above that.** Increment 9's
top rung is 10,000, which crosses it.

Node has no built-in Parquet reader. Every option is a third-party package:

| Option | Size | Notes |
| --- | --- | --- |
| `@duckdb/node-api` | large, native binary | fastest; reads remote Parquet over HTTP; native build per platform |
| `parquetjs` / `parquet-wasm` | moderate | pure JS or WASM; slower; WASM avoids native builds |
| `apache-arrow` | moderate | needs a Parquet layer alongside |

**This would be the project's first runtime dependency.** `DEC-030` has held zero dependencies so
far, which is why `NFR-028`'s dependency lint has had nothing to catch and why `NFR-030` (tests
without network) has been free rather than fought for.

### What is genuinely at stake

**Not** correctness. The `CorpusReader` seam means a Parquet reader is a drop-in third
implementation, and every pipeline stage is already proven against real data at the 100 and 1,000
rungs. What the 10,000 rung adds is **breadth of evidence** — most importantly for deduplication,
where increment 6's collapse proof covered only **4 duplicate groups**.

### Options

| # | Option | Cost | What it buys |
| --- | --- | --- | --- |
| **A** | Add a Parquet dependency (recommend `parquet-wasm` — no native build) | first dependency; ~10 MB; `NFR-030` needs a fixture path for offline tests | real 10,000 rung, full-corpus capability, honours the `CR-002` trigger |
| **B** | Raise the row-API cap to 10,000 for validation only | zero dependencies; ~100 requests, politely paced | the rung, but **violates the trigger you just approved** |
| **C** | Cap the real-data ladder at 2,000; validate 10,000 on synthetic fixtures | zero dependencies | performance already proven (958 ms/10,000, increment 8); **dedup breadth stays thin** |

### Recommendation: **A**, deferred to increment 9b

Do the ladder now at **100 → 1,000 → 2,000 on real data** (inside the approved trigger, no
dependency), and treat the Parquet reader as its own increment with its own decision.

Reasoning: the 10,000 rung's value is dedup breadth, and that is worth doing properly rather than
smuggling in as a side effect of a batch-size flag. Option B would mean approving a rule and
breaking it in the same session, which is worse than either honouring it or changing it openly.

**Requested:** approve A (and the package choice), or direct B or C.

---

## CR-006 — `NFR-014`'s 128 MB limit is being applied to a component architecture already excluded from Workers
**Raised:** 2026-08-27 · `[architect]` · **Status: OPEN — blocks `CR-005` criterion 4**
**Evidence:** `docs/research/R4-PARQUET-MEMORY.md`

**Finding.** Real corpus content cannot be read within 128 MB by any Parquet reader, because each
200 MB shard has **one row group** and the `content` column chunk is **136 MB compressed /
323 MB raw**. Measured: `parquet-wasm` 1,067 MB with content, 365 MB without; `hyparquet` 568 MB.
Two independent implementations, same conclusion. **The constraint is the data, not the library.**

**The category error.** `NFR-014` exists so pipeline stages stay Worker-compatible. `DATABASE.md`
§7 already recorded that the corpus connector **cannot run in a Worker** — that was the two-runtime
finding at G2. Constraining a batch-only extractor to a Workers isolate limit constrains nothing
real, and blocks work that is otherwise sound.

Measured separately, the split is clean:

| Component | Peak | Worker-compatible |
| --- | ---: | --- |
| Ingestion pipeline, 10,000 records | **58 MB delta** | yes |
| Parquet extraction | 365–1,067 MB | no, and never was |

**Requested amendment:**

> **`NFR-014`.** Memory use shall stay ≤128 MB for every **pipeline stage** and for the **edge
> runtime**, matching the Workers isolate limit, so no Worker-bound design depends on headroom
> production will not have. **Batch-runtime corpus extraction** is exempt and carries its own
> stated budget, measured and recorded, because it is architecturally excluded from Workers
> (`DATABASE.md` §7). Observed 2026-08-27: pipeline **58 MB** at 10,000 records; extraction peak
> **~1.2 GB**.

**Also requested:** approve the two-phase extraction of `R4` §5 option B — a one-time offline
extraction writing selected rows to `data/corpus/*.jsonl`, which the ladder then consumes within
128 MB. This keeps the honest memory claim where it belongs and needs no rule broken.

### DISPOSITION — 2026-08-27: **APPROVED (A + B)**

`NFR-014` amended. Extraction classified as a batch-only acquisition step with six binding
constraints (`DEC-036`). The pipeline budget is **unchanged at 128 MB**. **CR-006 CLOSED.**

---

## CR-007 — HTTP cache directives and conditional requests on the read API

**Raised:** 2026-08-27 · **Requested by:** user · **Status:** APPROVED, IMPLEMENTED
**Against:** SRS v1.1 (baselined — `DEC-021` requires a CR for any change)

### Why

The API computes `rights.cacheable` and emits it in the response **body**, but sets no
`Cache-Control` and no `ETag` on the response itself. Cloudflare's edge cache is therefore inert:
every request reaches a Worker and D1, even though skill metadata is near-static and most reads are
repeats. On the free tier this is the difference between a 100,000 requests/day ceiling and an
*origin-miss* ceiling.

This is the cheapest available scale lever and it costs nothing to operate.

### Change

Adds **`REQ-099`** and **`NFR-040`**. SRS moves to **v1.2**.

| Id | Text |
| --- | --- |
| `REQ-099` | Every API response shall carry explicit cache directives. A representation shall be marked publicly cacheable only where every record it contains reports `rights.cacheable`. Responses containing any record whose rights are `unknown`, all error responses, and the health endpoint shall be `no-store`. |
| `NFR-040` | Edge cache lifetime shall not exceed the removal propagation bound. `REQ-063` removal takes effect at the origin immediately; a cached representation may survive up to its `max-age`. That window shall be **≤300 s** and shall be stated in the runbook as a purge obligation. |

### Three consequences, stated rather than discovered later

1. **Removal is no longer instantaneous end-to-end.** A tombstoned record can be served from the
   edge for up to `max-age`. `REQ-063` was promoted to M precisely because removal matters, so the
   bound is set deliberately (300 s) rather than inherited from a default, and `docs/runbook.md`
   gains a purge step. **This is a real weakening and it is the price of the cache.**
2. **`ETag` deliberately excludes `meta`.** `request_id` and `generated_at` change on every request;
   including them would make every ETag unique and the cache useless. The validator covers `data`,
   `cursor` and `notice` — the parts that are actually the representation.
3. **A cached response replays the origin's `request_id`.** Several clients will see the same id.
   This is stated, not hidden: `meta.generated_at` then reads as the age of the representation,
   which is the more useful signal for a cached response anyway.

### Rejected alternative — Redis

Not adopted. The `Cache` port already exists, so Redis remains available as an adapter and nothing
here forecloses it. It is the wrong instrument for *this* problem: a Redis lookup from a Worker is a
network round trip **out of** the edge, frequently slower than the D1 query it replaces, whereas an
HTTP cache hit never leaves the colo. It also adds a paid external dependency and a managed secret,
against the intake's "cheap by construction" principle.

**Where Redis would genuinely earn its place** is `RateLimiter`, not `Cache`: the current adapter
counts in process memory, so on Workers each colo would enforce its own limit and `REQ-097` would
be globally unenforced. Recorded as `RSK-009`, not built.
