# SkillAppMD

**A resolver for agent skills.** Your coding agent asks it *"is there already a skill for this?"* — and gets back where the skill came from and whether the licence lets you use it.

```bash
npx skillappmd@latest init
```

That installs **one file**. No index, no corpus, no download. The resolver asks the API only at the moment your agent needs something, and fetches the skill itself from the repository that published it.

---

## The problem

There are **3,797,117** `SKILL.md` files across **282,200** public GitHub repositories. Roughly half are copies of each other. Most carry no discoverable licence. There is no way to ask *"has someone already solved this?"* — so agents write it again.

SkillAppMD is the index that answers that question, and is honest about what it doesn't know.

## What it is not

It is not a package registry and not a file host. **It serves no skill content under any licence.** `content` is always `null`; every response points at the origin repository instead. That single constraint (`REQ-062`) shapes the entire architecture — and it is what makes it possible to index other people's work honestly.

---

## How it works

```
SOURCE → DISCOVERY → QUEUE → FETCH → PARSE → NORMALISE → FINGERPRINT
       → DEDUPLICATE → PROVENANCE → LICENCE → CANONICAL INDEX → READ API
```

**Two hashes per record.** `content_hash` over raw bytes; `normalised_hash` after line endings, trailing whitespace and key order settle. Same normalised hash, different content hash means the same skill saved by a different editor. Both collapse to one canonical record, and every copy survives as an *occurrence* — so "this appears in 40 repositories" is a query, not a guess.

**Three licence layers, never merged.** Dataset, repository, and the frontmatter's own claim are recorded separately, with a `conflict` flag when they disagree. A file cannot licence itself out of its repository, so a frontmatter claim is recorded as a claim.

**Two rights states, and `unknown` is one of them.** Not three. A licence that forbids redistribution is still *known* — it reports `state: "known"` with `redistributable: false`. Collapsing those would destroy the difference between *"we know you may not"* and *"we do not know"*.

> **68.7%** of real records resolve to `unknown`. That is the ordinary case, not an edge case. `unknown` is never treated as permission.

**Facts and inferences are structurally separate.** `declared` holds what the source file says; `inferred` holds what SkillAppMD worked out. `provenance.field_origins` labels every field as `source_fact:` or `appmd_inference:` with the analyser version that produced it — so "which records did this analyser touch?" is a query too.

---

## The API

Six read-only endpoints. No write surface: ingestion is a batch job, not an HTTP call.

```
GET /api/v1/health
GET /api/v1/skills                    cursor-paginated
GET /api/v1/skills/:id
GET /api/v1/skills/:id/occurrences    where else the same file appears
GET /api/v1/sources/:id
GET /api/v1/search?q=                 keyword search over canonical metadata
```

Cursors are opaque and there is no offset parameter, because offset pagination is incorrect under concurrent writes. Responses carry `Cache-Control` and a strong `ETag`, and honour `If-None-Match` — **but a response is only publicly cacheable if every record in it has a known licence.** One `unknown`-rights record makes the whole page `no-store`, because a page is one representation and cannot be partially evicted.

---

## Repository layout

| Path | What lives there |
| --- | --- |
| `packages/skill-core` | pure domain. Zero dependencies, never sees a store |
| `packages/ports` | the interfaces: `CanonicalStore`, `ObjectStore`, `Queue`, `Cache`, `RateLimiter` |
| `packages/adapters/sql-store` | the SQL store. **Zero `node:` imports** — runs on Workers |
| `packages/adapters/sqlite` | the Node subclass: file open, WAL, backup, restore |
| `packages/adapters/d1` | Cloudflare D1. ~10 lines, because it is a composition |
| `packages/adapters/deferred-store` | an adapter synchronous code *cannot* satisfy — see below |
| `packages/ingestion` | parse, normalise, fingerprint, deduplicate, rights |
| `packages/connectors` | GitSkills corpus, SkillsMP |
| `packages/skillappmd` | the npm package and the resolver `SKILL.md` |
| `apps/api` | the router — a pure function of request → response |
| `apps/worker` | the Cloudflare Worker; the only file that knows about HTTP |
| `apps/cli` | 20 operator commands |
| `docs/`, `.ilana/` | architecture, research, and the full engineering ledger |

Dependency direction is **lint-enforced** (`packages/tools/src/depcheck.js`), and the build fails on a planted violation.

---

## Running it

Requires **Node 22+**. No account, no network, no paid plan.

```bash
node --test                              # the full suite
node packages/tools/src/depcheck.js      # dependency direction
node packages/tools/src/traceability.js  # requirement → test coverage
node apps/cli/src/appmd.mjs doctor       # config, schema, counts
```

Against Cloudflare locally:

```bash
npx wrangler d1 execute skillappmd-canonical --local --file=d1-schema.sql
npx wrangler dev --local
```

---

## Two dependencies

`parquet-wasm` and `apache-arrow`, both quarantined to one package and **batch-only** — they never load on the ingestion or serving path. Everything else is the Node standard library, including the database (`node:sqlite`).

---

## How this was built

Under [Ìlànà](https://github.com/), a gated engineering process: 11 phases, gates G0–G8, a written ledger of every decision, defect, risk and change. `.ilana/` is committed, so the reasoning is auditable rather than remembered.

| | |
| --- | --- |
| Tests | **405** executions of 352 cases |
| Mandatory requirements traced to a test | **152 / 152** |
| Defect density | 1.99 / KLOC |
| Defects found before verification | 15 of 16 |
| Real records ingested, byte-identical on re-run | 10,000 |

Some things that made it in, and are worth knowing before reading the code:

- **`unknown` rights and non-permanent retention were reversed by review**, not by a test. Two decisions that were consistent implementations of a wrong idea (`DEC-018`, `DEC-019`).
- **The portability proof was wrong once.** Two adapters "proved" the store port was implementation-independent — and both were synchronous, so D1 could not implement it. `DeferredMemoryCanonicalStore` now exists specifically to be an adapter that synchronous code *cannot* satisfy (`DEF-009`).
- **A health check reported `200 OK` while the database was unreachable**, because one `catch` swallowed every error and returned schema version 0. Three increments old (`DEF-010`).
- **The Worker would have failed to start**, twice: once because `node:sqlite` reached the edge bundle, once because a stray non-handler export is treated as an entrypoint. Neither is findable by a test running on Node.

Every one of those is written up in `.ilana/defects.md` with what it cost and why nothing caught it earlier.

---

## Status

**Live at [skill.appmd.dev](https://skill.appmd.dev)** — the site on Vercel, the API on Cloudflare Workers + D1, one origin (Next proxies `/api/v1/*` to the Worker).

```
https://skill.appmd.dev/api/v1/health
https://skill.appmd.dev/api/v1/search?q=pdf
```

The index currently holds a handful of seed records, not the full corpus — the ingestion ladder has been proven to 10,000 records locally but has not been run against production D1.

The npm package is **not published yet**, so `npx skillappmd@latest init` does not work. This README will say so until it does.

Semantic search (task → capability, rather than keyword matching) is specified and costed in `.ilana/changes.md` as `CR-010`, and is not built. Today, `q=extract content from a web page` returns **zero results** while `q=html` returns one — which is the whole argument for building it.

## Contributing

Read `docs/ONBOARDING.md` first — it covers the four-command run, the five things that will surprise you, and where the bodies are buried. `docs/coding-standard.md` is short and enforced.

Two rules that are not negotiable, because the project's honesty depends on them:

1. **No requirement without a test that proves the claim.** A test that passes for the wrong reason is a defect.
2. **`unknown` is never quietly turned into `false`.**

## Licence

MIT — see [LICENSE](LICENSE). That covers SkillAppMD's own code, **not** the skills it indexes; each of those stays under the licence of the repository that published it.
