# SOFTWARE CONFIGURATION MANAGEMENT PLAN

| | |
| --- | --- |
| Document | `scm-plan.md` v1.0 · Phase 06 · `[configuration-engineer]` · 2026-08-27 |
| Gate | G6 criteria 1, 6, 7 |
| Scope | The AppMD backend repository. The front-end is a **separate repository** (`CR-001`) |

---

## 1. What is under configuration control

| Item | Where | Why it is controlled |
| --- | --- | --- |
| Source | `packages/`, `apps/` | 98 files, all tracked |
| Architecture and requirements | `docs/` | The SRS is baselined; changes need a `CR` |
| **Process ledger** | `.ilana/` | Decisions, defects, gates, traceability. **Committed deliberately** — process history *is* project history |
| Dependency lockfile | `packages/connectors/gitskills/package-lock.json` | 7 packages pinned. A build is not reproducible if its versions are local-only |
| CI definition | `.github/workflows/verify.yml` | The pipeline is source, not console configuration |

**Deliberately not controlled**, each for a stated reason:

| Excluded | Reason |
| --- | --- |
| `data/corpus/`, `data/raw/` | Fetched, not authored. 71 MB of third-party content whose licences we do not hold (`DEC-019`) |
| `node_modules/` | Reconstructible from the lockfile |
| Secrets (`.env`, `*.key`, `*.pem`, `.dev.vars`) | `NFR-019`. CI scans for them on every push |
| Front-end files (`app/`, `public/`, `components.json`, root `package.json`) | **Another session's work** (`CR-001`). Present on disk, never tracked here |

That last row is a live hazard, not a historical note. `CR-003` records that `git add -A` once swept
37 front-end files into this repository. `DEC-032` prohibits `git add -A` while the tree is shared,
and commits stage explicit paths.

## 2. Branching strategy

Phase 1 is a solo project (intake Q7), so the strategy is deliberately minimal — and written down
so it survives a second contributor arriving.

```
main ────●────●────●────●────●────  every commit is a passing gate or an increment
```

**Trunk-based.** `main` is always green: 334 tests, dependency lint clean, secret scan clean.

**When a second person joins**, and not before:

```
main ──────●─────────────────●──────
            \               /
             feature/REQ-042 ──●──     branch per requirement or CR, squashed on merge
```

Rules that already hold and would carry over:

- A branch is named for its `REQ-###` or `CR-###`. If it maps to neither, the work has no
  requirement and Article 3 says write the requirement or delete the code.
- No merge while the suite is red.
- The ledger (`.ilana/`) is merged, never rebased — it is append-only by construction, and
  rewriting it would destroy the audit trail it exists to be.

## 3. Change control

Every change is a change request (Article 11). The record shows this is practised, not aspirational:

| CR | Type | Disposition |
| --- | --- | --- |
| `CR-001` | Adaptive | Repository shared with a front-end session → separate repositories |
| `CR-002` | Adaptive | Corpus read via row API, not Parquet → `REQ-003` amended |
| `CR-003` | Corrective | Front-end files wrongly tracked → untracked, `DEC-032` |
| `CR-004` | Corrective | `NFR-003` compared incomparable definitions → amended |
| `CR-005` | Adaptive | Parquet reader needs the first dependency → approved, quarantined |
| `CR-006` | Corrective | `NFR-014` applied to a component excluded from Workers → amended |

**Flow:** submit → impact analysis → approve or reject → implement → test → document. Six raised,
six closed, each with its disposition recorded in `.ilana/changes.md`.

**Three of the six amended a requirement rather than the code.** That is the system working: when
measurement showed a requirement was wrong, the requirement changed through change control instead
of being quietly ignored.

## 4. Build

There is no build step. ES modules, Node 22, no transpiler — **the source that runs is the source
you read**. This is a deliberate configuration-management property: nothing can differ between what
was reviewed and what executes.

Reproducing the environment from scratch:

```bash
git clone <repo> && cd appmd-skill-cloud
node --version                                    # 22.x required (node:sqlite)
npm ci --prefix packages/connectors/gitskills     # the ONLY install, 7 pinned packages
node packages/tools/src/depcheck.js .
node --test 'packages/**/test/*.test.js' 'apps/**/test/*.test.js'
```

**The environment-drift question, answered honestly.** *Can production be rebuilt from source with
no human remembering a step?* For the **local** environment: yes — the four commands above are the
whole of it. For a **Cloudflare deployment**: not yet, and nothing is deployed. `wrangler.toml`,
bindings and account configuration do not exist. That is `DEC-010` (no paid plan) and is Phase 2
work, recorded here rather than discovered at deploy time.

## 5. Release identification

`MAJOR.MINOR.PATCH`. Phase 1 releases are `0.x` — the API is `/api/v1/` but nothing is deployed and
no consumer exists, so no compatibility promise has been made to anyone yet.

Every release: a tag, a `CHANGELOG.md` entry, a change classification, and a traceable link from
each item to a `REQ` or `CR`.

## 6. Baselines

| Baseline | Established | Change requires |
| --- | --- | --- |
| SRS v1.1 | G1 attempt 2 | a `CR` |
| Design (92 `DES`, 10 `UI`) | G2, G3 | a `CR` |
| Schema v3 | Increment 11 | a migration (`REQ-094`) |
| Test baseline | G5 attempt 2 | tests may be added; **weakening one to go green is prohibited** |
