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
licence during processing** — measured at 68.7% of records resolving to `unknown`.

**Cannot be closed in Phase 1**, because closing it would require either serving nothing ever
(which makes the product pointless) or resolving licences we cannot resolve from the data available.
It is the price of operating over a corpus where 62% of repositories carry no licence.

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
