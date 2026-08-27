# DECISION REGISTER

Article 12: an assumption written down is engineering; an assumption unspoken kills the project.
`ASSUMPTION` = adopted without confirmation, open to reversal. `DECIDED` = evidence-backed.

---

## DEC-001 — Registers: FLEET / RIGOUR 3 / HYBRID
**Status:** DECIDED · 2026-08-27 · confirmed by user at intake Q10.

Gates enforce. Overrides logged and counted. Plan-driven through architecture (G1–G2),
incremental from construction (G3+).

*Rationale:* production infrastructure with reputational, licensing and security exposure;
no personal data at scale; nothing safety-critical. Rigour 4 would demand compensating
controls per override and independent review — disproportionate for a solo greenfield.

---

## DEC-002 — SkillsMP is re-scoped from "primary content source" to "discovery and signal source"
**Status:** DECIDED · evidence: `docs/research/R1-SOURCE-ACCESS-MODEL.md` §2, §3.

The brief (§2, §13) names SkillsMP the initial primary source. Research shows:
- SkillsMP hosts no content; it indexes `SKILL.md` files living in public GitHub repos.
- Its ToS forbids scraping or systematically downloading large portions of the site.
- No bulk export exists. REST caps at 500 req/day × 50 = 25,000 refs/day, keyword-only,
  within a capped result window. MCP has no daily quota but is still keyword-driven
  (max 2,500 results per distinct query).
- Sitemaps expose ~13,000 of a claimed 2,000,000 skills (~0.65%) — a deliberate sample.

**Therefore:** SkillsMP supplies seeds, popularity/star signal, occupation and category
taxonomy, and an RSS freshness feed. **GitHub is the content origin and the fetch target.**

*This does not weaken the brief; it satisfies brief §12 ("not: copy 2.3M skills into AppMD")
and §66 ("do not blindly scrape"), which anticipated exactly this outcome.*

---

## DEC-003 — Phase 1 ingests the GitSkills CC-BY-4.0 corpus as its primary dataset
**Status:** DECIDED · evidence: R1 §4.2 · Zenodo DOI 10.5281/zenodo.21875637

GitSkills (MSR 2027; Destefanis, Graziotin, Vaccargiu, Ortu) is a CC-BY-4.0 dataset of
3,797,117 `SKILL.md` occurrences across 282,200 repos, 1,877,981 distinct contents, with
content hashes and parsed frontmatter precomputed. 44.4 GB SQLite + Parquet mirror.

Chosen because it gives Phase 1:
1. real data at real scale, offline, at **zero crawl cost and zero ToS exposure**;
2. precomputed content hashes — direct input to fingerprint/dedup;
3. a **published 50.5% verbatim-duplication rate**, which becomes a falsifiable acceptance
   criterion for the deduplication engine rather than an untestable claim.

Live connectors (SkillsMP MCP, GitHub) are built to the identical `SourceConnector`
interface and proven on the brief's 100 → 1,000 → 10,000 ladder in parallel, so the
abstraction is validated by two genuinely different source shapes from the start.

**Constraint carried forward:** GitSkills is a 2026-08-10 snapshot and decays (`RSK-008`).
It is a **seed**, never the freshness authority.

---

## DEC-004 — SkillsMP access policy: keyed, low-volume, never crawler-shaped
**Status:** ASSUMPTION (interpretation) · open item `RSK-002`

`robots.txt` sets `Disallow: /api/` for all agents while the published docs invite keyed API
use at `/api/v1/`. Adopted reading: `robots.txt` governs autonomous crawlers; a client using a
key SkillsMP issued for the purpose is an invited consumer.

**Operating rules, effective immediately and enforced in code:**
- Identify with a truthful, contactable User-Agent. Never impersonate a browser or a known bot.
- Honour `Crawl-delay: 1` and every `Retry-After`.
- Stay well inside published limits; treat them as ceilings, not targets.
- Never bulk-fetch `/creators/**` HTML. Sitemaps are for discovery pointers only.
- No anti-bot circumvention of any kind, ever (brief §50).

**Action:** seek written clarification from SkillsMP before any sustained use. Until then this
is an assumption, and it is labelled as one.

---

## DEC-005 — Queue messages carry references, never content
**Status:** DECIDED · evidence: R1 §6.2 (Cloudflare Queues message size 128 KB)

Content is written to object storage; the queue message carries the storage key, content hash
and job metadata. Correct on Cloudflare by necessity and correct everywhere else on principle —
it keeps the queue cheap, makes messages replayable, and keeps payloads under any broker's cap.

---

## DEC-006 — Licence is modelled in three independent layers, defaulting to deny
**Status:** DECIDED · evidence: R1 §3, §4.2, §5 · owner `[ethics-officer]` · risk `RSK-004`

Three distinct, separately-recorded facts, never collapsed into one field:

| Layer | Source | Governs |
| --- | --- | --- |
| L1 dataset/aggregator | GitSkills CC-BY-4.0; SkillsMP ToS | our right to use the *compilation* |
| L2 repository | upstream repo `LICENSE` file | the repo's contents |
| L3 skill declaration | `license:` in `SKILL.md` frontmatter | the author's *claim* about this file |

Rules:
- CC-BY-4.0 on GitSkills licenses the **compilation**, not the individual skills. Attribution to
  GitSkills grants **no** right to redistribute any skill's text.
- L3 is a **claim**, not an authority. Where L2 and L3 disagree, record both, resolve neither
  silently, and fall to the more restrictive for redistribution purposes.
- Absent or unparseable licence ⇒ `UNKNOWN` ⇒ **`redistributable: false`**. Never infer permission
  from public accessibility (brief §38, §11 of intake).
- Every skill carries a computed rights posture: `indexable` / `linkable` / `cacheable` /
  `redistributable`, each with the layer and evidence that produced it.

---

## DEC-007 — Cloudflare is the runtime; the canonical store is decided at G2, not now
**Status:** ASSUMPTION · evidence: R1 §6 · resolved by `docs/DATABASE.md` before G2

Verified ceilings that bound the choice:
- **D1: 10 GB max per database** (paid). Binding constraint. 100 bound params/query hurts batch writes.
- **Queues: 5,000 msg/s per queue**, 128 KB messages, 10,000 queues — comfortably sufficient.
- **Workers: 6 simultaneous outgoing connections**, 128 MB memory, 10,000 subrequests (paid).
  Free tier (10 ms CPU, 50 subrequests) is **unusable for ingestion**; paid plan required.
- **Vectorize: 20M vectors/index**, **1,536 dimensions max**, topK ≤ 50 with metadata.

Provisional reading, to be argued properly in `DATABASE.md`: Workers + Queues + R2 + KV are a
good fit and cheap. D1 is adequate for Phase 1 (100 → 10,000 skills) and for control-plane data
indefinitely, but its 10 GB ceiling makes it a poor canonical store past low millions.
Vectorize fits 1.88M distinct contents in a single index; 1,536-dim is a hard cap on model choice.

No canonical-database commitment is made before the workload analysis the brief demands (§44).

---

## DEC-008 — Frontend, marketplace, accounts and recommendation-learning are deferred, not dropped
**Status:** DECIDED · brief §4, §56, §57

Deferred scope is recorded in `state.json:scope_deferred` so it reads as a deliberate deferral
with a reason, not as a gap discovered later at audit.

---

## DEC-009 — Phase 1 serves metadata, attribution and canonical source URL only
**Status:** DECIDED · user decision #1 · owner `[ethics-officer]`

No third-party skill **content** is served through the AppMD API in Phase 1, **even where the
licence appears permissive**. The public canonical model points back to the original source.

Raw content retained for internal processing is **internal processing data**, and carries:
provenance, retention rule, licence metadata, access control, and a working deletion path.
R2 (or its local equivalent) is **not** a public distribution layer in Phase 1.

*Architectural consequence, and the reason this is cheap to honour now and expensive later:*
the content store sits behind a **rights-checking access layer from the first commit**, so
enabling permitted hosting later is a **policy change**, not a re-architecture. If content were
served directly in Phase 1, retrofitting rights enforcement would mean touching every read path.

---

## DEC-010 — Two deployment targets, one codebase: LOCAL first, Cloudflare later
**Status:** DECIDED · user decision #2 · supersedes the deployment half of `DEC-007`

Cloudflare paid is **not** active. The free tier (10 ms CPU, 50 subrequests) cannot run
ingestion, and the user will not pay before the pipeline is proven. Correct call.

| Concern | LOCAL DEVELOPMENT (Phase 1) | PRODUCTION CLOUD (later) |
| --- | --- | --- |
| Compute | local process / `workerd` via Wrangler dev | Workers (paid) |
| Queue | local queue driver (durable, file/SQLite-backed) | Cloudflare Queues |
| Object store | local filesystem under `data/objects/` | R2 |
| Canonical DB | SQLite | decided in `DATABASE.md` before G2 |
| Cache | in-process / SQLite table | KV |
| Scheduler | cron / CLI invocation | Cron Triggers |

**Binding rule:** every such dependency sits behind a **port interface** in `packages/`, with
two adapters. Business logic imports the port, never the vendor SDK. This is not ceremony —
it is what makes the local-to-cloud move a configuration change, and it is also what makes the
pipeline unit-testable without network.

**Explicitly NOT done:** architecting around Cloudflare *free-tier* limits. Free tier is a
non-target. We design for local-now and paid-Workers-later, and skip the middle entirely.

---

## DEC-011 — Minimal GitSkills subset: `repos` in full + one `artifacts` shard
**Status:** DECIDED · user decision #3 · evidence `docs/research/R2-GITSKILLS-CORPUS.md`

The Hugging Face Parquet mirror is **13.4 GB across 78 files in 4 tables**, not 44.4 GB (that is
the Zenodo SQLite). Shards are individually addressable over HTTP.

Phase 1 pulls **`repos` (0.02 GB, all 282,200 rows) + one `artifacts` shard (~208 MB)** —
about **0.5% of the SQLite archive**, ample for 100 → 1,000 → 10,000.
`artifact_siblings` (6.96 GB) is **not** pulled in Phase 1.
All corpus data lands in **`data/corpus/`** (path revised by `DEC-028`), gitignored.

---

## DEC-012 — `file_sha` is an exact-duplicate key only; AppMD computes its own fingerprints
**Status:** DECIDED · evidence R2 §4

GitSkills `file_sha` is a **git blob SHA** — whitespace and line-ending sensitive. It answers
"byte-identical?" and nothing else. AppMD therefore computes, independently:

- `content_hash` — SHA-256 over raw bytes (exact tier, portable across sources)
- `normalised_hash` — SHA-256 over normalised text (line endings, trailing whitespace,
  frontmatter key order) → catches trivial variants `file_sha` misses
- `semantic_fingerprint` — deferred past Phase 1, for `NEAR_DUPLICATE` (brief §13)

`file_sha` is retained as a **source fact** for cross-checking, never as AppMD's identity key.

---

## DEC-013 — Shard sampling bias is stated, not hidden
**Status:** ASSUMPTION · evidence R2 §4

Parquet shards follow write order, so one shard is **not** a random sample. Phase 1 accepts a
single shard for the 100/1,000 rungs and **states the bias in the ingestion report**. Before any
statistical claim about the corpus (duplication rate, licence distribution), sampling must draw
across shards. Article 10: no claim without an instrument, and no instrument without its bias.

---

## DEC-014 — GitHub is the provenance authority; SkillsMP never defines identity
**Status:** DECIDED · user's additional decision, confirming and extending `DEC-002`

Canonical skill identity derives from **origin repository coordinates** — `repo_full_name` +
`path` + content hash — never from a SkillsMP page URL or its internal id. SkillsMP identifiers
are stored as **one more external reference among several**, exactly like any future source.

*Why this matters beyond tidiness:* if SkillsMP terminated access tomorrow (`RSK-003`,
permitted by their ToS "without prior notice"), zero canonical identities would be invalidated.
Identity that depends on a third party you do not control is not identity.

---

## DEC-015 — Raw immutability vs deletability: resolved by tombstoning, not by weakening either
**Status:** DECIDED · raised at G1 criterion 8 (requirement conflict)

`REQ-029`/`REQ-031` require raw content to be immutable. `REQ-034` requires it to be deletable
on request. Both are correct and they conflict.

**Disposition — a raw record has two parts with different lifetimes:**

| Part | Lifetime |
| --- | --- |
| Content bytes | deletable |
| Provenance envelope (hash, source, URL, timestamps, licence, deletion record) | permanent |

Deletion removes the bytes and writes a **tombstone** carrying the reason, actor and timestamp.
Immutability holds over the envelope; deletability holds over the bytes.

*Consequence for `NFR-010` (rebuild from canonical):* an index rebuilt after a deletion is
**equivalent minus tombstoned records**, and the rebuild report must state how many were
tombstoned. Silently rebuilding a smaller index and calling it identical would be the kind of
optimistic reporting Article 2 forbids.

*Why not just refuse deletion:* skill authors did not opt in to being indexed (`ETH-002`). A
system that structurally cannot honour a removal request has decided that question in advance,
and decided it against the person with the least power in the arrangement.

---

## DEC-016 — Corpus reading is streamed by row group; the 128 MB ceiling is a design input
**Status:** DECIDED · raised at G1 criterion 8 (requirement conflict)

`REQ-003` reads a ~208 MB Parquet shard. `NFR-014` caps worker memory at 128 MB to match the
Cloudflare Workers isolate limit.

**Disposition:** the corpus connector reads **row group by row group**, never whole-file. Parquet
is columnar and row-group addressable, so this is the format's intended access pattern, and it
also means Phase 1 reads only the columns it needs (`R2 §2`) rather than every column.

The memory ceiling is therefore **not** a constraint we tolerate — it is the thing that forces
the streaming design that `NFR-031` ("no design element shall assume the dataset fits in
memory") demands anyway. Local development inherits the production constraint on purpose;
this is the whole point of `NFR-013`/`NFR-014`.

---

## DEC-017 — NFR-011 is a provisional target, not an acceptance criterion
**Status:** DECIDED · user decision #1

The analyst invented "10,000 occurrences ≤30 minutes" with no benchmark behind it. It does not
gate G4. `[metrologist]` replaces it with a measured target from Phase 1 benchmark data.

*Article 10 in its plainest form:* a number nobody measured is not a requirement, it is a guess
wearing a requirement's clothes. Keeping it visible as a working figure is useful; letting it
fail a build is not.

---

## DEC-018 — `unknown` is an explicit rights state
**Status:** DECIDED · user decision #14 · **reverses an analyst departure from BRIEF §38**

v1.0 collapsed the brief's `Unknown` into all-false booleans and added `cacheable`. The user
rejected the collapse and was right to.

Rights carry `state: "known" | "unknown"` alongside `indexable`, `linkable`, `redistributable`.
`cacheable` is tracked additionally and **never substitutes** for `unknown`.

*Why the collapse was wrong, stated precisely:* "we know this may not be redistributed" and
"we do not know whether this may be redistributed" have the same operational consequence today
and **completely different consequences tomorrow**. The first is settled. The second is a
research task, and it is the one that becomes resolvable the moment a licence is found. Encoding
both as `redistributable: false` destroys the information needed to tell them apart, and destroys
it silently. That is precisely the fact/inference confusion `DOM-006` exists to prevent, and I
introduced it in the very model meant to prevent it.

---

## DEC-019 — Raw retention is rights-aware and defaults to non-permanent
**Status:** DECIDED · user decision #15 · closes the largest residual legal exposure in v1.0

v1.0 retained full content for every occurrence unconditionally, including `unknown` licences.
Storing is not redistributing, but holding a complete copy of millions of files of unknown
licence at rest is a posture, and it was one nobody had chosen deliberately.

**Lifecycle:** process → derive metadata → retain provenance envelope → **delete raw bytes when
retention is no longer justified.** `unknown` and restrictive postures get the shortest retention.
The provenance envelope and tombstone survive permanently (`DEC-015`).

*Consequence accepted:* `REQ-032` (reprocess without source contact) is weakened for records
whose bytes have expired — those must be re-fetched. That is the correct trade. The alternative
is holding content we have no clear right to hold, in order to avoid a network request.

---

## DEC-020 — Three identity classes; personal data limited to provenance necessity
**Status:** DECIDED · user decision #4

GitSkills anonymised *commit* authors, but `repos.owner` and `repo_full_name` are identifiable
natural persons, retained in full and exposed by the API. Intake Q5 assumed low personal-data
exposure; that assumption was thinner than it looked and this corrects it.

Identity resolves to **repository / organisation / individual author** (`DOM-013`). Each
person-linked field records the provenance purpose justifying it; a field without a purpose is
not stored (`REQ-092`). The public API withholds individual-author fields beyond attribution
need (`REQ-093`).

---

## DEC-021 — Design for future scale without implementing future scale
**Status:** DECIDED · user decisions #16, #17 · **governing principle, outranks individual requirements**

| Phase 1 | Future |
| --- | --- |
| simple, cheap, testable | replaceable components, horizontal scaling |

No distributed infrastructure enters because 1B+ records are eventually wanted. The obligation is
**replaceability** (`NFR-027`, `NFR-028`) and **non-foreclosure** (`NFR-031`–`NFR-034`) — not
construction.

*Operational form:* where a requirement could be read as demanding infrastructure Phase 1 does
not need, it is read the narrower way. This principle is the tie-breaker, and it is written down
so that "we'll need it eventually" stops being a valid argument for building it now.

---

## DEC-022 — Phase 1 backup is a verified file copy, nothing more
**Status:** DECIDED · user decision #3 + `DEC-021`

RPO ≤ 24 h, RTO ≤ 4 h. Periodic full snapshot of canonical data plus schema version. Restore
documented **and executed at least once** in Phase 1 — a restore procedure that has never been
run is a document, not a capability.

Explicitly **not** in Phase 1: replication, clustering, point-in-time recovery, cross-region.
The requirement exists so the capability is designed in; the implementation stays proportionate.

---

## DEC-023 — The dedup threshold is a quality target, not an automatic gate failure
**Status:** DECIDED · user decision #13

≥99.9% agreement with `dedup_primary` is a target. A shortfall is a **finding to triage**, since
legitimate policy differences from the oracle are expected (their grouping is exact-content; ours
adds a normalisation tier).

**The binding obligation is explanation, not agreement.** An unexplained disagreement *is* a gate
failure. This keeps the oracle useful without letting someone else's policy choices fail our build.

---

## DEC-024 — Corpus sampling must be stratified across shards; single-shard sampling is withdrawn
**Status:** DECIDED · **supersedes the sampling method in `DEC-011`** · evidence R3 Finding 2

`DEC-011` fixed Phase 1's corpus subset at "one `artifacts` shard". Measurement shows the shards
are **ordered by file size**: mean `body_chars` runs 10 → 146 → 704 → … → 19,352 across the
offset range, monotonically, over three orders of magnitude.

The first shard contains **~10-byte files**. Validating deduplication or parsing against it would
have produced passing metrics that proved nothing.

**Revised:** Phase 1 draws a **stratified sample across the full offset range**. The 100 / 1,000 /
10,000 ladder is sampled proportionally across shards, not taken from the head.
`repos` (0.02 GB) is still taken in full. The ~1 GB disk cap (`NFR-018`) is unaffected — stratified
sampling reads *less* data than a whole shard, since it needs only selected row groups.

*This is the clearest vindication of the "measure, don't estimate" rule in the whole project so
far. `DEC-011` was written from a plausible assumption about shard contents. The assumption was
wrong, and only measurement exposed it.*

---

## DEC-025 — RSK-005 RESOLVED: Cloudflare Queues has native DLQ and at-least-once delivery
**Status:** DECIDED · **closes `RSK-005`** · evidence: Cloudflare docs fetched 2026-08-27

| Question | Answer (verified) |
| --- | --- |
| Native DLQ? | **Yes.** `dead_letter_queue = "queue-name"` in wrangler config |
| Trigger | Message reaches the consumer's retry limit (default **3**) |
| No DLQ configured | *"messages that reach the retry limit are deleted permanently"* |
| DLQ retention without consumer | 4 days |
| Delivery guarantee | **At-least-once.** *"may be delivered more than once"* |
| Ordering | Not stated in the fetched page → **UNVERIFIED**; assume none |

**Consequences:**

1. `REQ-020`/`REQ-021` are satisfiable natively. No application-level DLQ needed on Cloudflare —
   but the **port interface still defines one**, because the local adapter must provide the same
   semantics (`NFR-027`).
2. *"Without a DLQ configured, messages are deleted permanently."* A missing DLQ therefore causes
   **silent data loss**. The queue port shall **refuse to initialise a consumer without a DLQ**,
   turning a configuration omission into a startup failure rather than a slow leak.
3. **At-least-once delivery makes `REQ-016` (idempotency) load-bearing, not merely good practice.**
   Cloudflare's own guidance is to use a unique message id as a primary key or idempotency key —
   which is exactly the design `REQ-016` and `DOM-001` already mandate. The requirement was
   written before this was verified; it turns out to be the vendor's own prescription.
4. Ordering is unverified, so **no stage may assume ordered delivery**.

---

## DEC-026 — Provenance stored as a JSON column, not one row per field origin
**Status:** ASSUMPTION · evidence `docs/DATABASE.md` §3.2

Field-level provenance modelled as rows is **44% of total relational storage** (3.35 GB of 7.65 GB
at full corpus). As a JSON column on the canonical row: **~4.3 GB total**, roughly doubling D1
headroom from ~5.0M to ~8.8M occurrences.

`REQ-040` requires provenance to be **recorded and retrievable**, not queried across records.
JSON satisfies it. Row-per-origin remains the migration target if per-field provenance querying
becomes a requirement; PostgreSQL JSONB+GIN would supply it without changing the storage shape.

*Labelled ASSUMPTION because the 10-fields-per-skill figure is a modelling estimate, not a measurement.*

---

## DEC-027 — Canonical store: SQLite local → D1 production → PostgreSQL at a measured trigger
**Status:** DECIDED · **closes `DEC-007`** · evidence `docs/DATABASE.md` §3–§6

| Stage | Store |
| --- | --- |
| Phase 1 local | **SQLite** |
| Phase 1–2 production | **Cloudflare D1** |
| Beyond the trigger | **PostgreSQL** |

**Migration trigger, whichever first:** canonical size **>7 GB** (70% of D1's ceiling); or a
requirement needing vector/full-text/graph **in the same engine**; or write throughput blocked by
D1's 100-bound-parameter cap.

**The finding that drove this:** measured against real corpus data, the **entire known skill
ecosystem — 3.8M occurrences — is 7.65 GB, or ~4.3 GB with `DEC-026`. One D1 database holds it,
at about $2/month.** The brief's framing invites the assumption that Cloudflare storage is
immediately inadequate. It is not. D1's ceiling is crossed at ~5.0M occurrences (~8.8M with
`DEC-026`), which is *beyond the known corpus*.

**Explicitly rejected: sharding D1 across many databases.** Available (50k databases, 1 TB) and
wrong. It buys capacity by permanently adopting shard routing, cross-shard queries, per-shard
migrations and per-shard backups — to defer a migration performable once. `DEC-021` settles it:
that is *building* future scale. Migrating to Postgres is cheaper and is a single event.

**Why not start on Postgres:** an account, a Workers connection story (Hyperdrive), and ops
burden, for capacity Phase 1 will not use for years. Cheap, understandable, replaceable now.

**This decision is only affordable because `NFR-027`/`NFR-028` hold.** If domain logic imports a
SQL driver, `DEC-027` is a trap rather than a plan. The falsifiable test — write the Postgres
adapter and pass the full suite **without editing `skill-core/` or `ingestion/`** — becomes a G4
criterion.

---

## DEC-028 — Corpus path moves to `data/corpus/`
**Status:** DECIDED · **supersedes the path in `DEC-011`** · raised by `CR-001`

A parallel front-end session placed tracked source at `data/mock-data.ts`. The backend had
reserved and gitignored `data/` for the GitSkills corpus.

Corpus data now lives at **`data/corpus/`**, and only that path is ignored, so the front-end's
tracked file stays visible to git. Verified by `git check-ignore` in both directions.

*Small change, recorded because silently re-ignoring `data/` would have made another session's
work vanish from version control without anyone being told — the kind of failure that is
invisible until it costs someone a day.*

---

## DEC-029 — Backend layout under a shared root: per-package manifests, no root workspace manifest yet
**Status:** DECIDED · closes `CR-001` · user ruling: separate repositories

`appmd-skill-cloud` is the backend repository. The front-end moves to its own repo and talks to
this one **only** through `docs/API.md`. Its files stay in the working tree untouched until its
owner relocates them.

**The practical constraint:** `/package.json` exists and belongs to the front-end
(`appmd-skill-frontend`). The user's instruction not to modify front-end files means the backend
**cannot claim the root manifest**, which is where an npm workspace root would normally live.

**Resolution:** each backend package carries its **own `package.json`**. No root workspace
manifest is created while the front-end occupies the root.

| Now | After the front-end's owner relocates its files |
| --- | --- |
| `apps/*` and `packages/*` each self-contained | add a root workspace manifest, delete the per-package duplication |

Directory names were checked for collision: the front-end uses `app/`, `components/`, `pages/`,
`lib/`, `types/`, `data/`. The backend uses **`apps/`**, **`packages/`** — neither collides, including
on a case-insensitive filesystem.

*Cost of this arrangement:* some duplicated devDependencies across packages until the root is free.
*Benefit:* zero modification to another session's files, and conversion to a workspace later is
adding one file and deleting a few lines. Cheap and reversible beats correct and destructive.

---

## DEC-030 — SQLite adapter uses built-in `node:sqlite`, not a third-party driver
**Status:** DECIDED · evidence: Node v22.19.0 ships `node:sqlite` (`DatabaseSync`, `backup`)

Phase 1's canonical store needs **no dependency install and no network**. That satisfies three
requirements at once: `NFR-016` (no paid plan to run locally), `NFR-030` (unit tests run with no
network), and `DEC-021` (cheap, understandable).

It also keeps `NFR-028` honest: with zero third-party packages there is nothing for domain code to
accidentally import.

**Known caveat, recorded not glossed:** `node:sqlite` is flagged **experimental** and emits a
warning; its API may change. Mitigation is structural rather than hopeful — the adapter sits behind
the `CanonicalStore` port, so swapping to `better-sqlite3` is one file. That is exactly the
replaceability `NFR-027` exists to provide, tested here on its first real occasion.

*Dialect discipline:* everything in `schema.js` must remain expressible in D1, since `DEC-027`'s
production step depends on the local and production adapters sharing a dialect.

---

## DEC-031 — Write-time invariants are enforced twice: in domain code and as database constraints
**Status:** DECIDED · `NFR-004`, `NFR-006`

`skill-core` asserts attribution and the rights invariant; the schema *also* enforces them as
`CHECK` constraints:

```sql
attribution_repository TEXT NOT NULL CHECK (attribution_repository <> '')
CHECK (rights_redistributable = 0 OR rights_state = 'known')
```

Deliberate duplication. A domain assertion protects the path that goes through the domain; a
database constraint protects **every** path, including a future bulk loader, a migration, or a
second adapter written by someone who has not read `PROVENANCE.md`.

An invariant that only holds when the code remembers to check it is a convention, not an invariant.
`TC-041` and `TC-042` prove the database refuses the write even when domain assertions are bypassed.
