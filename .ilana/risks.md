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
