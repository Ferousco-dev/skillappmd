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
