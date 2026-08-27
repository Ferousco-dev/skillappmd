# PROVENANCE

| | |
| --- | --- |
| Document | `PROVENANCE.md` v1.0 · Phase 02 · `[architect]` · 2026-08-27 |
| Satisfies | `DOM-006`, `DOM-009`, `DOM-011`, `DOM-013`, `REQ-039`–`REQ-041`, `REQ-061`, `REQ-092`, `REQ-093`, `NFR-004`, `NFR-005`, `NFR-025`, `NFR-036`, `NFR-038` |

---

## 1. The distinction the whole system rests on

> **A source fact is what someone else asserted. An AppMD inference is what we concluded.
> They are never the same field.**

BRIEF §12 states this. `DOM-006` requires it. It is the reason AppMD can publish derived judgements
about third parties' work without misrepresenting them — and the reason a wrong inference is a
correctable AppMD error rather than a libel about an author.

```jsonc
"declared": { "name": "foo", "description": "..." }          // SOURCE FACT
"inferred": { "capabilities": [                               // APPMD INFERENCE
   { "value": "auth", "producer": "cap-engine", "version": "0.1.0",
     "confidence": 0.82, "at": "2026-08-27T13:45:00Z" } ] }
```

Structural separation, not a naming convention (`REQ-070`: "in their structure, not in prose").
A consumer cannot accidentally read an inference as a fact, because they are not in the same object.

**An inference without `producer` + `version` + `at` is not storable.** Without them, `REQ-095`
re-analysis cannot identify what to reprocess, and a stale verdict is indistinguishable from a
current one.

## 2. Storage shape (`DEC-026`)

Field-level origins live in a JSON column on the canonical row — 44% of relational storage as rows,
~half that as JSON (`DATABASE.md` §3.2).

```jsonc
"provenance": {
  "sources": [ { "source_id": "gitskills", "external_ref": "owner/repo:path",
                 "channel": "local", "at": "2026-08-27T13:45:00Z" } ],
  "field_origins": {
    "declared.name":        "source_fact:gitskills",
    "licence.l2_repository":"source_fact:gitskills#repos.license",
    "rights.redistributable":"appmd_inference:rights-engine@0.1.0" }
}
```

`channel` records **how** the data was obtained (`rest`/`mcp`/`rss`/`sitemap`/`local`/`github-api`)
— the audit trail that keeps an authorised API consumer distinguishable from a crawler
(`REQ-096`, and the evidence that would answer `RSK-002` if it were ever contested).

## 3. Attribution is a write-time invariant (`NFR-004`)

Repository, owner and canonical source URL are **mandatory**. A record lacking any of them is
**rejected at write time**, not filtered at read time.

The difference matters: filtering at read time means the bad record exists, and every future read
path must remember to filter. Rejecting at write time means it cannot exist. For most OSS licences
attribution failure *is* the licence violation, so this is a legal control implemented as a
database constraint.

## 4. Personal data (`DOM-013`, `DEC-020`)

GitSkills anonymised **commit** authors — but `repos.owner` and `repo_full_name` are identifiable
natural persons, retained in full and reachable through the API. Intake Q5's "low personal-data
exposure" was thinner than it looked.

| Class | Example | Retained | Public API |
| --- | --- | --- | --- |
| Repository | `owner/repo` | yes — identity + attribution | yes |
| Organisation | `anthropics` | yes — attribution | yes |
| **Individual author** | personal account login | **only where attribution requires** | **minimised** (`REQ-093`) |

Every person-linked field records the **provenance purpose** justifying it. **A field without a
stated purpose is not stored** (`REQ-092`) — data minimisation as a schema rule rather than a policy
document. Not collected at all: emails, real names beyond the public handle, follower graphs,
contribution histories (`NFR-036`).

Authors did not opt in. `REQ-063`'s correction/removal path is mandatory in Phase 1 for that reason.

## 5. Time (`NFR-038`, `DOM-011`)

All timestamps UTC, RFC 3339, `Z`-suffixed. No local time, no naive timestamps, anywhere.

`discovered_at`, `last_verified_at`, `first_commit_at`, `last_commit_at` are distinct facts and are
never collapsed. Freshness (BRIEF §34) is **derived** from them, never assumed — a skill last
committed in 2026-01 and last verified 2026-08 has two different ages, and conflating them would
make "is this still relevant?" unanswerable.

## 6. Failure modes

| Failure | Response |
| --- | --- |
| Attribution missing | **Write rejected** (`NFR-004`) |
| Field origin unclassifiable | Write rejected (`NFR-005`) |
| Inference without producer/version | Write rejected |
| Source conflict on a field | Both retained with origins; **no silent winner** |
| Person-linked field without purpose | Not stored (`REQ-092`) |
