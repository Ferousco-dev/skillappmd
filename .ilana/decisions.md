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
