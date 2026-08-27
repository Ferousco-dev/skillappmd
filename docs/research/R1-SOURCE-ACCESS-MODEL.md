# R1 — Source Access Model Research

Status: **COMPLETE** · Date: 2026-08-27 · Agent: `[architect]` + `[ethics-officer]`
Gate dependency: blocks G1 (Requirements) and G2 (Architecture).

Every claim below is either **VERIFIED** (fetched directly, this date) or **UNVERIFIED**
(inferred / reported second-hand). Constitution Article 2.

---

## 1. Headline finding

> **SkillsMP is not a content source. It is a discovery and ranking source.**

SkillsMP does not host skill content. It indexes `SKILL.md` files that live in public GitHub
repositories, and it says so itself. Its own Terms of Service forbid the very thing a naive
reading of the brief would have had us build.

This inverts one assumption in the brief. The brief lists SkillsMP as the "initial primary
source" for ingestion. Research shows SkillsMP can legitimately serve as a **seed and signal**
source, but **GitHub is the content origin** and must be the fetch target. Section 12 of the
brief ("build a canonical intelligence/index layer, not a copy of 2.3M skills") is not merely
compatible with this finding — it is *required* by it.

---

## 2. SkillsMP — verified access surface

### 2.1 What it is (VERIFIED)

- Independent community project. Explicitly **not affiliated with Anthropic or OpenAI**.
- Collects `SKILL.md` files from **public GitHub repositories**.
- Self-reported catalogue size: **2M+** files (`/api/llms.txt`, `/about`, OpenAPI description).
  Third-party reports range 425k → 1.5M → 1.6M → 2M+ depending on date. Treat the number as
  **volatile marketing figure, not a data contract**.
- Organises by ~800+ SOC occupations and category slugs.
- Site's own framing: *"indexes skill references but does not certify or install them."*

### 2.2 REST API (VERIFIED — https://skillsmp.com/openapi.json)

```
Base URL   https://skillsmp.com
Spec       https://skillsmp.com/openapi.json   (OpenAPI 3.0.3, spec itself MIT-licensed)
Portal     https://skillsmp.com/developers
```

| Endpoint | Method | Notes |
| --- | --- | --- |
| `/api/v1/skills/search` | GET | **The only search endpoint.** `q` is **required**. |
| `/api/health` | GET | Health check. |

Parameters: `q` (required, ≤200 chars), `page` (≥1), `limit` (default 20, **max 50**),
`sortBy` (`stars` \| `recent`), `category`, `occupation`, `language` (large ISO enum + `mul`/`und`).

Auth: `Authorization: Bearer sk_live_...`, free key from `/developers`.

**Rate limits (VERIFIED):**

| Tier | Daily | Per-minute |
| --- | --- | --- |
| Anonymous | 50 | 10 |
| API key | **500** | 30 |

Daily counters reset 00:00 UTC. Response headers `X-RateLimit-Daily-Limit`,
`X-RateLimit-Daily-Remaining`. Errors: `INVALID_API_KEY` 401, `MISSING_QUERY` 400,
`INVALID_OCCUPATION` 400, `INVALID_LANGUAGE` 400, `DAILY_QUOTA_EXCEEDED` 429, `INTERNAL_ERROR` 500.

**Pagination is not enumeration.** The spec states results are *"canonicalized to its final
page"* beyond the queryable window, and exposes `totalIsExact`, `isCapped`, `maxResults`,
`hasNext`. Translation: **there is a hard result window per query.** `total` may be only a
*"proven lower bound"*. Wildcard searches (`*`) are **explicitly unsupported**.

> **Arithmetic that ends the "ingest via REST" idea:**
> 500 requests/day × 50 results = **25,000 skill *references* per day, maximum**, and only
> those reachable through keyword queries within a capped window. Reaching 2M would take
> ~80 days of perfect, non-overlapping, non-duplicating queries — which keyword search
> cannot deliver, because queries overlap heavily and the window is capped.

### 2.3 MCP server (VERIFIED — https://skillsmp.com/.well-known/mcp)

```
POST https://skillsmp.com/mcp     transport: streamable-http     auth: none
tools: search_skills, get_skill, list_categories
```

| Limit | Value |
| --- | --- |
| Daily quota | **none** |
| Ingress | 50 POST / 10s / client IP |
| Valid tool calls | **30 tool calls / 60s / client IP** |
| On 429 | honour `Retry-After` |

`search_skills` returns: name, author, description, detected content language, **GitHub URL**,
star count, SkillsMP page URL. `get_skill` inspects one catalogue entry + its source repository.

This is a materially better channel than REST (no daily cap) and it returns the **GitHub URL**,
which is the field we actually need. It is, however, **still keyword-driven** — `search_skills`
requires a non-empty `query` (`pattern: ".*\\S.*"`) and caps `page` at 50, `limit` at 50.
So the MCP window is **2,500 results per distinct query**. Still not enumeration.

### 2.4 Sitemaps (VERIFIED — fetched and counted this date)

`robots.txt` explicitly **Allows** `/` and `/api/llms.txt` while **Disallowing** `/api/` and
`/auth/` for all user agents, with `Crawl-delay: 1`. Sitemaps are advertised in `robots.txt`,
which makes them a sanctioned discovery channel.

| Sitemap | Bytes | `<loc>` count |
| --- | --- | --- |
| `/sitemaps/skills-popular.xml` | 1,943,669 | **11,452** |
| `/sitemaps/repositories-discovered.xml` | 607,484 | **4,459** |
| `/sitemaps/skills-discovered.xml` | 279,530 | **1,710** |
| `/sitemaps/occupations.xml` | 86,934 | — |
| `/sitemaps/pages.xml` | 19,782 | — |

**Critical:** the sitemaps expose roughly **13,000 skills out of a claimed 2,000,000 — about
0.65%.** They are a *sample*, deliberately. There is **no bulk enumeration channel on
SkillsMP**, and its operators evidently designed it that way.

Useful structural fact: skill URLs are `/creators/{owner}/{repo}/{skill-slug}` and repository
URLs are `/creators/{owner}/{repo}`. The `{owner}/{repo}` pair **maps directly to GitHub**.
So even the sample sitemap yields ~4,459 GitHub repositories to seed from, at zero API cost.

### 2.5 Also present (VERIFIED)

- `/.well-known/ai-catalog.json` — AIR-spec catalogue advertising 3 agent skills
  (`search-skills`, `get-skill-detail`, `list-categories`) hosted at content-hash URLs.
- `/schemamap.xml` → RSS feed `/feed.xml` (`schema.org/CreativeWork`, "Latest Agent Skills").
  **An RSS feed is an incremental-discovery channel and should be polled** — cheap, sanctioned,
  and exactly the right shape for `lastmod`-driven refresh.
- `Content-Signal: ai-train=yes, search=yes, ai-input=yes` in `robots.txt`.

---

## 3. Legal analysis — SkillsMP Terms of Service

Quoted clauses (VERIFIED via https://skillsmp.com/terms):

| Clause | Consequence for AppMD |
| --- | --- |
| *"You may not scrape or systematically download large portions of the website"* | **Bulk crawling SkillsMP is prohibited.** Not a grey area. The 2M-record mirror is off the table via this route. |
| *"You may browse, search, and download skills for personal and commercial use"* | Commercial use of the **search** function is permitted. |
| *"You must comply with the individual licenses of each skill repository"* | Licence obligations pass through to AppMD **per skill**, not per source. |
| *"Each skill is subject to its repository's license. Skills Marketplace does not claim ownership of any indexed skills."* | SkillsMP grants us **no rights over content**. Any redistribution right must come from the upstream repo licence. |
| *"does not endorse or verify the quality, safety, or functionality of any skill"* | Precedent for how AppMD must frame its own trust scores (§18 of the brief). |
| *"provided 'as is' without warranties"* / *"restrict or terminate access ... without prior notice"* | **SkillsMP is not a dependable dependency.** Architecture must not have a single point of failure on it. |

### 3.1 The robots.txt / API tension — RESOLVED, with a caveat

`robots.txt` says `Disallow: /api/` for **every** user agent. The published API docs
simultaneously invite programmatic access under `/api/v1/` with a bearer token.

Reading: `robots.txt` governs **crawlers performing autonomous discovery**; an authenticated
client using a key SkillsMP issued for that purpose is an **invited API consumer**, not a
crawler. The `Disallow` exists to keep search-engine bots out of JSON endpoints.

**Ruling for AppMD:** use `/api/v1/` and `/mcp` **only** as a keyed, rate-limited, low-volume
client; never with a crawler user-agent; never as a substitute for the disallowed bulk crawl.
Fetch HTML pages under `/creators/**` **only** as sanctioned by sitemaps + `Crawl-delay: 1`,
and **never in bulk** (ToS). Record as `RSK` and seek written clarification from SkillsMP.

**This is an open item, not a settled one.** → `RSK-002`, `DEC-004`.

---

## 4. GitHub — the actual content origin

### 4.1 Code Search API (VERIFIED via GitHub docs + corroborating sources)

| Constraint | Value |
| --- | --- |
| Auth | required for code search |
| Rate | **10 requests/minute** |
| Result cap | **1,000 results per query** |
| Indexing caveats | file-size limits, default branch only, activity requirements |

1,000-result cap × keyword queries cannot enumerate ~3.8M files **unless the search space is
partitioned**. Which brings us to the most valuable find of this research.

### 4.2 GitSkills dataset — a legally clean bulk seed (VERIFIED)

> **GitSkills: A Dataset of Agent Skills on GitHub**
> Destefanis, Graziotin, Vaccargiu, Ortu · MSR 2027 · published 2026-08-10
> arXiv: `2608.10906` · Zenodo DOI: `10.5281/zenodo.21875637`
> **Licence: CC-BY-4.0** · 44.4 GB SQLite, Parquet mirror on Hugging Face

| Figure | Value |
| --- | --- |
| `SKILL.md` file occurrences | **3,797,117** |
| Public repositories | **282,200** |
| **Distinct file contents** (post-dedup) | **1,877,981** |
| Unique account owners | 195,841 |
| **Verbatim copies** | **50.5%** |

Per-record fields: repo info, path, basename, location classification, **content hash**, full
text, **parsed front matter**, folder contents, repo metadata (stars, language, fork status,
dates), sampled commit history (author accounts anonymised, emails/names redacted).

Their discovery method is the documented answer to the 1,000-result cap: *"partitioned the
search space by file size until every range can be retrieved completely."* We should adopt this
for our own live GitHub connector.

**Stated limitations:** public repos only; a **lower bound** on the population.

**Why this matters more than anything else in this document:**

1. It is **CC-BY-4.0** — redistribution and commercial reuse permitted **with attribution**.
2. It supplies **content hashes and parsed frontmatter already computed**, which is exactly the
   input to our fingerprint → dedup stages.
3. It lets Phase 1 be built and validated against **real data at real scale, offline, at zero
   crawl cost and zero legal exposure** — no rate limits, no ToS friction, no crawler ethics
   problem.
4. Its **50.5% verbatim duplication rate is an empirical validation target** for our
   deduplication engine. If our fingerprinting does not land near that figure on their corpus,
   our dedup is wrong. That is a testable acceptance criterion, not a vibe.

**Caveat that must be carried into the licence model (`[ethics-officer]`):** CC-BY-4.0 covers
**the dataset compilation**. It does **not** relicense the individual `SKILL.md` contents, which
remain under their own repository licences. Attribution to GitSkills does **not** grant a right
to redistribute any given skill's text. Two separate licence layers. → `DEC-006`.

### 4.3 Other ecosystem observations (UNVERIFIED — reported, not fetched)

- `github/awesome-copilot` documents skills; a `gh skill` CLI command is reported to exist.
- Skillhound.ai reportedly runs the same pattern we are designing: scheduled discovery via
  GitHub Code Search, repo-tree expansion, **dedup by content hash**, OpenSearch reload.
  **We are not first.** Convergent design is mild evidence the shape is right; it is also
  competitive context the brief did not mention.
- `skills-md` GitHub topic exists — a cheap, high-precision discovery channel via the Topics API.

---

## 5. The SKILL.md standard (VERIFIED, spec-level)

```yaml
---
name: my-skill          # REQUIRED. ≤64 chars, [a-z0-9-] only.
                        # No XML tags. Reserved words "anthropic"/"claude" forbidden.
description: ...        # REQUIRED. non-empty, ≤1024 chars, no XML tags.
                        # Must state WHAT it does AND WHEN to use it.
license: Apache-2.0     # optional
allowed-tools: [...]    # optional — SECURITY-RELEVANT
metadata: {author, version}  # optional
---
Markdown body — no format restrictions.
```

Two required fields only. **Spec-compliant runtimes ignore unrecognised frontmatter keys** —
so the parser must be tolerant of unknown keys and must never reject on them.

Architectural consequences:

- The **only** guaranteed structured signal is `name` + `description`. Everything else in the
  canonical model is either absent, inferred, or drawn from repo context. This directly
  constrains how much §15 (AI Understanding) can lean on frontmatter.
- `allowed-tools` is a **first-class security input** for §18 and must be parsed, not merely stored.
- `license` in frontmatter is a **claim by the skill author**, which may contradict the
  repository `LICENSE` file. Both must be captured, separately, with provenance. → `DEC-006`.
- `name` is **not unique** across the ecosystem and must never be used as an identity key
  (brief §13 already says this; the spec confirms why).

---

## 6. Cloudflare limits — measured against this workload (VERIFIED)

### 6.1 D1

| Limit | Free | Paid |
| --- | --- | --- |
| **Max database size** | 500 MB | **10 GB** |
| Databases per account | 10 | 50,000 |
| Storage per account | 5 GB | 1 TB |
| Queries per Worker invocation | 50 | 1,000 |
| Max bound parameters/query | **100** | 100 |
| Columns per table | 100 | 100 |
| Max SQL statement | 100 KB | 100 KB |
| Max query duration | 30 s | 30 s |
| Concurrent connections/Worker | 6 | 6 |

**Assessment: D1 cannot be the canonical store beyond low millions of skills.**
The 10 GB per-database ceiling is the binding constraint, and the 100-bound-parameter cap makes
large batch inserts awkward (forces many small statements — bad for a write-heavy ingest).
1 TB/account via 50,000 databases exists but means **application-level sharding**, which is real
distributed-systems complexity we would be adopting on day one for a benefit we do not yet need.

D1 is, however, entirely adequate for **Phase 1 at 100 → 10,000 skills** and for control-plane
data (sources, jobs, cursors) indefinitely.

### 6.2 Queues

| Limit | Value |
| --- | --- |
| Queues per account | 10,000 |
| **Message size** | **128 KB** |
| Message retries | 100 |
| Consumer batch size | 100 |
| Max batch wait | 60 s |
| **Throughput per queue** | **5,000 msg/s** |
| Retention | 24 h free / configurable to **14 days** paid |
| Backlog per queue | 25 GB |
| Concurrent consumer invocations | 250 (push) |
| Consumer wall-clock | 15 min |

**Assessment: strong fit.** 5,000 msg/s/queue × 10,000 queues is far beyond our needs.
The **128 KB message cap** dictates a hard rule: **messages carry references, never content.**
Content goes to R2; the message carries the key. This is good design regardless of platform.
Retention ≤14 days sets an upper bound on how long a backlog may sit unprocessed — relevant to
the dead-letter design (§48).

Docs did not state DLQ support or delivery guarantees on the page fetched → **UNVERIFIED**,
must confirm before relying on it. → `RSK-005`.

### 6.3 Workers

| Limit | Free | Paid |
| --- | --- | --- |
| CPU per request | 10 ms | **5 min** (default 30 s) |
| Cron trigger CPU | 10 ms | 30 s (<1 h interval) / 15 min (≥1 h) |
| Queue/cron wall clock | — | **15 min** |
| **Subrequests per invocation** | **50** | **10,000** |
| Memory per isolate | 128 MB | 128 MB |
| Script size (gzipped) | 3 MB | 10 MB |
| Cron triggers per account | 5 | 250 |
| **Simultaneous outgoing connections** | **6** | **6** |

**Assessment: the free tier is unusable for ingestion** (10 ms CPU, 50 subrequests). Paid is
required. The **6 simultaneous connections** limit is the sharpest constraint on a fetch worker
and directly sets per-worker concurrency — it must be designed for, not discovered in production.
128 MB memory forbids in-memory batch accumulation of any size.

### 6.4 Vectorize

| Limit | Value |
| --- | --- |
| **Vectors per index** | **20,000,000** |
| Indexes per account | 100 free / **50,000** paid |
| **Max dimensions** | **1,536** |
| Metadata per vector | 10 KiB |
| Metadata indexes per index | 10 |
| Indexed data per metadata index | 64 bytes |
| topK | 50 with metadata / 100 without |
| Batch insert | 1,000 (Workers) / 5,000 (HTTP) |

**Assessment: adequate, with a ceiling to respect.** 20M vectors/index means the 1.88M *distinct*
GitSkills contents fit in **one index** comfortably. Reaching 100M+ requires sharding across
indexes (50,000 × 20M = 1e12 theoretical), which is tractable but must be planned as a routing
layer, not retrofitted. **1,536 dimensions is a hard cap** — it eliminates any embedding model
above that width and must be a stated constraint on model selection. `topK ≤ 50` with metadata
constrains the retrieval stage of §23/§24 and forces a two-stage retrieve→rerank design.

---

## 7. Risks raised by this research

| ID | Risk | L | I | Mitigation |
| --- | --- | --- | --- | --- |
| `RSK-001` | SkillsMP catalogue is unreachable in bulk by any sanctioned route; brief's "primary source" premise is invalid | **Certain** | High | Re-scope SkillsMP to seed/signal; make GitHub + GitSkills the content path |
| `RSK-002` | `robots.txt Disallow: /api/` vs published API — interpretation could be wrong | Med | High | Keyed low-volume use only; seek written clarification; never crawler-UA |
| `RSK-003` | SkillsMP may "restrict or terminate access at our discretion without prior notice" | Med | Med | No hard dependency; connector must be droppable without data loss |
| `RSK-004` | Per-skill licence ≠ repo licence ≠ frontmatter licence claim; redistribution exposure | High | **High** | Three-layer licence model + default-deny redistribution |
| `RSK-005` | Queues DLQ support and delivery guarantees UNVERIFIED | Med | Med | Verify before G2 close; design app-level DLQ if absent |
| `RSK-006` | GitHub code search 10 req/min + 1,000-result cap makes live discovery slow | High | Med | Size-partitioning (GitSkills method); topics API; treat as background, never user-facing |
| `RSK-007` | Publishing `trust_score` on third-party code creates defamation/reliance exposure | Med | **High** | `[ethics-officer]` owns presentation rules; scores framed as signals, never guarantees |
| `RSK-008` | GitSkills is a 2026-08-10 snapshot and will decay | Certain | Low | Seed only; live connectors carry freshness |

---

## 8. Decisions this research forces

Recorded in `.ilana/decisions.md` as `DEC-001` … `DEC-008`.

The single most consequential one:

> **`DEC-003` — Phase 1 ingests from the GitSkills CC-BY-4.0 corpus, not from a live crawl.**
> It gives real data, at real scale, with an empirically known duplication rate to validate
> deduplication against, at zero crawl cost and zero ToS exposure. Live connectors
> (SkillsMP MCP, GitHub) are built to the same `SourceConnector` interface and proven on small
> controlled batches in parallel — exactly the brief's 100 → 1,000 → 10,000 ladder.

---

## 9. Sources

All fetched 2026-08-27 unless noted.

- https://skillsmp.com/robots.txt · https://skillsmp.com/terms · https://skillsmp.com/about
- https://skillsmp.com/openapi.json · https://skillsmp.com/api/llms.txt
- https://skillsmp.com/.well-known/mcp · https://skillsmp.com/.well-known/ai-catalog.json
- https://skillsmp.com/sitemap.xml and the five child sitemaps
- https://arxiv.org/html/2608.10906 · https://zenodo.org/doi/10.5281/zenodo.21875637
- https://docs.github.com/en/rest/search/search · https://github.blog/changelog/2023-03-10-changes-to-the-code-search-api/
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview · https://agentskills.io/specification
- https://developers.cloudflare.com/{d1,queues,workers,vectorize}/platform/limits/
