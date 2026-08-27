# RISK REGISTER
L = likelihood, I = impact. Owner in brackets.

| ID | Risk | L | I | Mitigation | Status |
| --- | --- | --- | --- | --- | --- |
| RSK-001 | SkillsMP unreachable in bulk by any sanctioned route; brief's "primary source" premise invalid | Certain | High | `DEC-002` re-scope to seed/signal; GitHub is content path | **MITIGATED** |
| RSK-002 | `robots.txt Disallow: /api/` vs published API — our interpretation may be wrong `[ethics-officer]` | Med | High | **CLOSED 2026-08-27 on live evidence (`DEC-038`)**: anonymous access is offered with published limits, so the API is pre-authorised; robots governs crawlers, not documented API consumers | **CLOSED** |
| RSK-003 | SkillsMP may terminate access "without prior notice" (ToS) | Med | Med | No hard dependency; connector droppable without data loss | MONITOR |
| RSK-004 | Per-skill licence ≠ repo licence ≠ frontmatter claim; redistribution exposure `[ethics-officer]` | High | High | `DEC-006` three-layer model, default-deny | **OPEN** |
| RSK-005 | Cloudflare Queues DLQ support + delivery guarantees UNVERIFIED | Med | Med | Verified 2026-08-27: native DLQ, at-least-once. See `DEC-025` | **CLOSED** |
| RSK-006 | GitHub code search 10 req/min + 1,000-result cap makes live discovery slow | High | Med | Size-partitioning (GitSkills method); topics API; background only | MITIGATED |
| RSK-007 | Publishing `trust_score` on third-party code creates defamation/reliance exposure `[ethics-officer]` | Med | High | Presentation rules owned by ethics-officer; signal not guarantee | **OPEN** |
| RSK-008 | GitSkills is a 2026-08-10 snapshot and decays | Certain | Low | Seed only; live connectors own freshness | ACCEPTED |

---

## Closure disposition — 2026-08-27, G8 criterion 3

Every open risk is closed, **deferred with an owner and a date**, or withdrawn. Nothing is left in
an undefined state.

### `RSK-004` — licence exposure — **DEFERRED, not closed**

**Owner:** `[ethics-officer]` · **Review date:** Phase 2 planning, before any content is served.

**Reduced, not eliminated.** `DEC-019` made raw retention rights-aware and non-permanent, and
`REQ-062` serves no content at all in Phase 1. Residual exposure: **AppMD holds bytes of unknown
licence during processing** — measured at 60.1% of records resolving to `unknown` (n=4,665).

**Cannot be closed in Phase 1**, because closing it would require either serving nothing ever
(which makes the product pointless) or resolving licences we cannot resolve from the data available.
It is the price of operating over a corpus where 47.8% of repositories carry no licence.

**Trigger for re-assessment:** the first proposal to serve any third-party content.

### `RSK-007` — trust-score reliance and defamation exposure — **DEFERRED, not closed**

**Owner:** `[ethics-officer]` · **Review date:** before any score is published (Phase 4 earliest).

**Structurally reduced.** `ETH-001`'s six conditions are implemented and verified against the
running system: no bare score is representable, absence is never rendered as "safe", and an appeal
route exists (`REQ-063`). Phase 1 publishes **no score at all**.

**Cannot be closed while the system could publish judgements about identifiable third parties.** A
false negative — a developer trusting our score and shipping a compromise — is a harm AppMD would
have *caused*, because our score creates reliance the author's own README never would.

**Trigger:** the first proposal to expose any security or trust signal publicly.

### Closed this run

| Risk | Disposition |
| --- | --- |
| `RSK-001` | Mitigated — SkillsMP re-scoped to seed/signal (`DEC-002`) |
| `RSK-002` | **Closed on live evidence** (`DEC-038`) — the API is pre-authorised |
| `RSK-003` | Monitored — no hard dependency on SkillsMP; `DEC-014` means its loss invalidates zero identities |
| `RSK-005` | Closed — native DLQ verified (`DEC-025`) |
| `RSK-006` | Mitigated — size-partitioning method documented |
| `RSK-008` | Accepted — corpus snapshot decay, seed only |

---

## `RSK-009` — per-colo rate limiting does not enforce a global budget

**Raised:** 2026-08-27 (`CR-007`) · **Owner:** `[architect]` · **Review:** Phase 2, before deploy
**Likelihood:** certain if deployed as-is · **Impact:** moderate

`MemoryRateLimiter` counts in process memory. On Workers each colo runs its own isolate, so a
client hitting N colos gets N× the budget and `REQ-097` is enforced locally but not globally.

**Not a defect** — `REQ-097` explicitly scopes Phase 1 to one in-process implementation and defers
distributed limiting to `DEC-021`. It is recorded here because deployment is the moment the gap
becomes real, and the `RateLimiter` port already exists to absorb the fix.

**This is the one place Redis would genuinely earn its keep** (`CR-007` §Rejected alternative):
shared mutable counters with TTL is exactly Redis's shape, and unlike caching it is not something
the edge can do for free. Durable Objects are the Cloudflare-native alternative and avoid an
external paid dependency. Neither is built.

---

## `RSK-010` — the `NFR-014` memory margin is now 4 MB

**Raised:** 2026-08-27 (`CR-008`) · **Owner:** `[architect]` · **Review:** before the 100k rung
**Likelihood:** high at any larger batch · **Impact:** moderate — a budget breach fails `NFR-014`

Making the store port asynchronous allocates a Promise per store call. Measured at the 10,000-record
rung: **peak delta 119 MB → 124 MB**, against a 128 MB budget. The ladder still passes, but the
headroom fell from 9 MB to **4 MB**, and `DEF-007` was originally raised at 131 MB — so this is
within 7 MB of a defect the project has already had once.

**Not accepted silently.** The mitigation is known and cheap: the pipeline streams one record at a
time, so the Promises are short-lived and the pressure is allocation rate rather than retention.
Batching store calls per record (one round trip instead of three) would recover most of it and is
also what a D1 adapter wants anyway, since each call there is a network round trip.

**Trigger:** the first ladder rung above 10,000 records, or the first D1 measurement.
