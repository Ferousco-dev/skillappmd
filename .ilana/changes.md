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
