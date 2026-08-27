# ONBOARDING — operating AppMD from the documents alone

| | |
| --- | --- |
| Document | `ONBOARDING.md` v1.0 · Phase 08 · 2026-08-27 · G8 criterion 8 |
| Test | Could a new engineer run, understand and extend this **without asking anyone**? |

---

## 1. Run it in four commands

```bash
git clone <repo> && cd appmd-skill-cloud
npm ci --prefix packages/connectors/gitskills     # the ONLY install: 7 pinned packages
node packages/tools/src/depcheck.js .             # layering must be clean
node --test 'packages/**/test/*.test.js' 'apps/**/test/*.test.js'
```

Node 22 is required (`node:sqlite` is built in). There is **no build step** — the source that runs is
the source you read.

## 2. What this is

An **intelligence layer over a skill ecosystem AppMD does not own.** That single fact generates most
of the non-obvious design:

- **Attribution and provenance are functional requirements**, enforced at write time. A record
  without attribution cannot be stored.
- **Default-deny on rights.** No licence means no permission — 62% of real repositories have none.
- **Every derived claim names its producer and version**, so a wrong inference is a correctable
  AppMD error rather than a libel about an author.

## 3. Read in this order

| # | Document | Why |
| --- | --- | --- |
| 1 | `docs/SRS.md` | What it must do. 150 requirements, baselined |
| 2 | `docs/ARCHITECTURE.md` | Layering, two runtimes, subsystem→increment map |
| 3 | `docs/DATABASE.md` | Why SQLite→D1→Postgres, with the arithmetic |
| 4 | `.ilana/decisions.md` | **39 decisions with reasoning.** The most useful document here — it records why, including where the reasoning was wrong |
| 5 | `docs/retrospective.md` | What the process caught and missed |

If you read only one, read `.ilana/decisions.md`. Code tells you what; that tells you why, and where
someone already tried the obvious thing and found it wrong.

## 4. The five rules that are enforced, not encouraged

| Rule | Enforced by |
| --- | --- |
| Domain code imports no I/O and no vendor SDK | `depcheck.js` — fails the build |
| `parquet-wasm`/`apache-arrow` stay in one package | same lint, quarantine mode |
| Every requirement has a test | `traceability.js` in CI |
| Every in-scope subsystem has an increment | `subsystem-coverage.js` in CI |
| No credential reaches source control | secret scan in CI |

Each was proven by **planting a violation and watching the build fail**. If you disable one, that is
a decision — record it as a `DEC`.

## 5. Operate it

```bash
node apps/cli/src/appmd.mjs doctor            # config, schema version, counts
node apps/cli/src/appmd.mjs source list       # sources and their rate limits
node apps/cli/src/appmd.mjs skill list --json
node apps/cli/src/appmd.mjs backup create
node apps/cli/src/appmd.mjs index rebuild --confirm
```

Everything destructive needs `--confirm` and tells you what survives before you give it.
`docs/runbook.md` has the incident responses.

## 6. Five things that will surprise you

1. **The corpus shards are ordered by file size.** Reading the first N rows gives ~10-byte files.
   Always sample stratified (`DEC-024`) — this has produced a plausible wrong answer three times.
2. **`rights: unknown` is a state, not "false".** *"Known not redistributable"* and *"not known"*
   have identical consequences today and different ones tomorrow (`DEC-018`).
3. **The parser is deliberately not a YAML parser.** Anchors, aliases and tags are *rejected*, not
   implemented. Untrusted input, smallest possible grammar (`DEF-005`).
4. **Indexing is not on the ingest path.** `search()` reads a derived index built by
   `rebuildSearchIndex()`. Ingest then rebuild (`DATABASE.md` §46, `DEF-007`).
5. **A test that names a requirement must exercise it.** `DEF-008` hid an unbuilt subsystem for
   weeks because a title claimed a requirement the body never touched.

## 7. Where the bodies are buried

`.ilana/defects.md` — 8 defects with cause analysis. Read `DEF-002`, `DEF-005` and `DEF-008` before
writing tests here. All three are variations on the same lesson: **fixtures encode the author's
assumptions, and real data does not share them.**

## 8. What is NOT built

`REQ-005` GitHubConnector · `REQ-014` RSS polling — both priority S, declared in `DEC-039`.
Cloudflare deployment — `DEC-010`, nothing deployed. Live R2 — a boundary, **not** verified.
AI, embeddings, graph, resolution, composition — future phases, all with a seat kept in the schema.
