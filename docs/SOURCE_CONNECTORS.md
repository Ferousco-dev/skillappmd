# SOURCE CONNECTORS

| | |
| --- | --- |
| Document | `SOURCE_CONNECTORS.md` v1.0 · Phase 02 · `[architect]` · 2026-08-27 |
| Satisfies | `REQ-001`–`REQ-008`, `REQ-014`, `REQ-024`–`REQ-028`, `REQ-096`, `NFR-023`, `NFR-024`, `NFR-037` |
| Evidence | R1 (access model), R2 (corpus schema), R3 (measurements) |

---

## 1. The contract

```
SourceConnector
  id(): SourceId
  accessPolicy(): AccessPolicy          ← REQ-006. Registration fails without it (REQ-007)
  discover(cursor?, limit): Page<DiscoveryRecord>
  identify(record): ExternalIdentity
  getMetadata(id): SourceMetadata
  getContent(id): RawContent | NotPermitted | NotAvailable
  getVersion(id): VersionRef
```

`AccessPolicy` is **data, not code** (`DOM-012`):

```jsonc
{ "requests_per_minute": 30, "requests_per_day": 500,
  "max_concurrency": 6,                       // NFR-013, matches Workers ceiling
  "auth": "bearer" | "none" | "local",
  "permitted_methods": ["rest", "mcp"],       // never "html-bulk"
  "robots": { "applies": true, "url": "https://.../robots.txt" },
  "tos_notes": "no systematic bulk download",
  "backoff": { "base_ms": 1000, "jitter": true, "max_attempts": 5 } }
```

The runtime enforces the policy. A connector cannot exceed its own declared limits, because it is
not the connector that counts requests.

**`getContent` may legitimately return `NotPermitted`.** That is not an error; it is a rights
outcome, and the pipeline must handle it as a normal path (`REQ-098`).

## 2. Normalised discovery record (`REQ-002`)

```jsonc
{ "source": "gitskills",
  "external_id": "owner/repo:skills/foo/SKILL.md",
  "repo_full_name": "owner/repo",     // GitHub coordinates = provenance authority (DEC-014)
  "path": "skills/foo/SKILL.md",
  "name": null, "url": "...", "author": "owner",
  "license_hint": "MIT",              // SOURCE FACT, not authority (DEC-006 L2/L3)
  "version_ref": "<blob sha | commit | null>",
  "discovered_at": "2026-08-27T13:45:00Z",   // NFR-038 UTC RFC3339
  "source_payload": { }               // verbatim, for reprocessing (REQ-032)
}
```

Identity is **never** the aggregator's id (`DEC-014`). Two sources describing the same file
produce the same `(repo_full_name, path)` and converge at dedup.

## 3. `GitSkillsCorpusConnector` (`REQ-003`) — Phase 1 primary

| | |
| --- | --- |
| Runtime | **Batch only.** Parquet + DuckDB. Cannot run in a Worker (`DATABASE.md` §7) |
| Access | Local Parquet shards from HF; `repos` in full (0.02 GB) |
| Rate limits | None — local files |
| Content | `artifacts.content` (primaries only, R3 Finding 3) |
| L2 licence | `repos.license` for all 282,200 repos |
| Attribution | **CC-BY-4.0 to GitSkills, mandatory** (`NFR-026`) |

**Sampling is stratified across the offset range (`DEC-024`), never head-of-shard.** R3 measured
shards ordered by file size: offset 0 yields ~10-byte files, offset 3.4M yields ~19 KB. Head
sampling would validate the pipeline against near-empty files and report success.

**Reads by row group** (`DEC-016`), selecting only needed columns — never whole-file.

## 4. `SkillsMPConnector` (`REQ-004`) — discovery and signal only

| Channel | Limits (verified R1) | Use |
| --- | --- | --- |
| **MCP** `POST /mcp` | no daily quota; 30 tool calls/60 s/IP | **preferred** |
| REST `/api/v1/skills/search` | 500/day, 30/min (keyed) | fallback |
| RSS `/feed.xml` | polling | incremental discovery (`REQ-014`) |
| Sitemaps | robots-advertised | seed pointers only |
| **HTML `/creators/**`** | — | **FORBIDDEN in bulk (ToS)** |

**Hard constraints in code, not in prose:**

- `q` is required; wildcards unsupported. **Enumeration is impossible by design** — the connector
  exposes no `discoverAll()` and must not pretend to.
- `page ≤ 50`, `limit ≤ 50` ⇒ **2,500 results per distinct query**, a ceiling the connector states.
- Truthful contactable User-Agent (`REQ-026`); never a browser or bot impersonation.
- Honour `Crawl-delay: 1` and every `Retry-After` (`NFR-023`, `NFR-037`).
- `getContent()` returns **`NotAvailable`** — SkillsMP hosts no content. Content resolution is
  GitHub's job (`DEC-002`).

**Open: `RSK-002`.** `robots.txt` disallows `/api/` while the docs invite keyed API use.
Operating under `DEC-004`'s conservative reading; clarification letter drafted, unsent.
`REQ-096` requires each request to record **which access channel** it used, so API consumption and
crawling stay separable in the record if the question is ever raised.

## 5. `GitHubConnector` (`REQ-005`, priority **S**)

Content and licence authority when the corpus lacks a record. 10 req/min code search, 1,000
results/query — so discovery uses the **file-size partitioning** method the GitSkills authors
documented (R1 §4.2), recursively splitting size ranges until each returns under 1,000.

`mining_runs` in the corpus contains their actual queries: a free, verified starting point.

**Demoted to S because the corpus already supplies content and L2 licence.** The abstraction it
proves stays **M**.

## 6. Robots compliance (`REQ-096`, `NFR-037`)

`RobotsPolicy` port: fetch, cache with stated freshness, evaluate **before** each request.
Disallowed ⇒ request not issued. Every request records its channel (`rest` / `mcp` / `rss` /
`sitemap` / `local`), so an authorised API consumer remains distinguishable from a crawler.

**No circumvention exists anywhere in this system** (`REQ-027`, `NFR-024`). Not as a flag, not as
a config option, not commented out.

## 7. Proving `REQ-008`

Adding a source must touch **no** pipeline code. The proof is that Phase 1's two mandatory
connectors are maximally different:

| | GitSkills | SkillsMP |
| --- | --- | --- |
| Transport | local Parquet | HTTPS MCP/REST |
| Enumeration | full scan | **impossible** (keyword-only) |
| Rate limits | none | strict |
| Content | yes | **never** |
| Runtime | batch only | either |

If one contract serves both, it will serve GitLab, a registry, or a future source. If it only
serves one, the abstraction is decoration — and that is a **G2 criterion**, not an aspiration.
