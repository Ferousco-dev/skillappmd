# LICENSING AND RIGHTS

| | |
| --- | --- |
| Document | `LICENSING.md` v1.0 · Phase 02 · `[architect]` + `[ethics-officer]` · 2026-08-27 |
| Satisfies | `DOM-007`, `DOM-008`, `REQ-056`–`REQ-063`, `REQ-098`, `NFR-006`, `NFR-026` |
| Addresses | `RSK-004` |

---

## 1. Three layers, never collapsed (`DOM-007`, `DEC-006`)

| Layer | Source | Governs |
| --- | --- | --- |
| **L1** dataset / aggregator | GitSkills CC-BY-4.0; SkillsMP ToS | our right to use the **compilation** |
| **L2** repository | upstream `LICENSE` file (`repos.license`) | the repository's contents |
| **L3** declaration | `license:` in `SKILL.md` frontmatter | the author's **claim** about this file |

Recorded independently, each with its evidence (`REQ-056`). Never merged into one field.

**Two errors this structure prevents:**

- *"MIT = everything from the repository is MIT."* L2 governs the repo; a vendored subdirectory may
  carry a different licence. L2 is authority over its own scope, not over every byte beneath it.
- *"CC-BY-4.0 on GitSkills means we can redistribute the skills."* L1 licenses the **compilation**.
  Attribution to GitSkills grants **no** right to any skill's text. Two entirely separate grants.

Where L2 and L3 disagree: both retained, conflict flagged, **more restrictive applied** (`REQ-060`).
No silent winner — a disagreement is information about the world, not noise to be resolved.

## 2. Rights posture (`DOM-008`, `DEC-018`)

The brief's four concepts, with **`unknown` as an explicit state**:

```jsonc
"rights": {
  "state": "known" | "unknown",     // ← EXPLICIT. Never collapsed into false booleans
  "indexable": true, "linkable": true, "redistributable": false,
  "cacheable": true,                // additional; never a substitute for `unknown`
  "basis": "L2/L3 conflict → most restrictive applied",
  "computed_at": "2026-08-27T13:45:00Z" }
```

**Why `unknown` must survive as a state.** "Known not redistributable" and "not known whether
redistributable" have the *same* consequence today and *entirely different* consequences tomorrow.
The first is settled. The second is a resolvable research task that becomes answerable the moment a
licence file turns up. Encoding both as `redistributable: false` destroys the information needed to
tell them apart — and destroys it silently.

*This document records that the architect made exactly that error in SRS v1.0 and the stakeholder
reversed it (`DEC-018`). It is preserved here because the reasoning is the point, not the mistake.*

Rights are **computed**, never inherited as a stored flag (`REQ-059`), and recomputed when any layer
changes. `computed_at` + `basis` make every posture auditable.

## 3. Resolution rules

```
L2 present, recognised SPDX, permissive       → state=known, redistributable per licence terms
L2 present, copyleft                          → state=known, redistributable=false (Phase 1)
L2 and L3 conflict                            → state=known, MOST RESTRICTIVE, conflict=true
L2 absent, L3 present                         → state=unknown  ← a claim is not authority
L2 absent, L3 absent                          → state=unknown
L2 unparseable                                → state=unknown
```

`state == "unknown"` ⇒ `redistributable = false`, **always** (`REQ-058`).
Never infer permission from public accessibility (BRIEF §38).

SPDX normalisation where recognised, `UNKNOWN` otherwise — **never a guess** (`REQ-057`).
A licence guessed wrong is worse than a licence marked unknown: the first produces false confidence,
the second produces a research task.

`NFR-006`: **0 records may carry `redistributable = true` without recorded L2 evidence.** Testable,
and it is the single assertion that keeps the whole rights model honest.

## 4. Phase 1: nothing is served (`REQ-062`, `DEC-009`)

No third-party content through the API in Phase 1, **regardless of licence**. The public model
points back to the origin.

The rights engine still runs in full. It drives **retention** (`REQ-098`) and it means enabling
permitted hosting later is a **policy flip**, not a re-architecture — because the access layer that
would enforce it already sits on the read path.

## 5. Rights-aware retention (`REQ-098`, `DEC-019`)

| Posture | Raw-byte retention |
| --- | --- |
| `unknown` | **shortest** — deleted after processing |
| `redistributable: false` | short |
| `redistributable: true` | standard; still not permanent by default |

Process → derive metadata → retain provenance envelope → **delete bytes when retention is no longer
justified**. Envelope and tombstone survive permanently (`DEC-015`).

This closed the largest residual exposure in SRS v1.0, which retained full content for every
occurrence unconditionally — including unlicensed material. Storing is not redistributing, but
holding millions of files of unknown licence at rest is a posture, and it was one nobody had chosen.

## 6. Attribution (`REQ-061`, `NFR-004`, `NFR-026`)

Every public record carries repository, owner and canonical source URL — enforced at **write time**,
so the API is structurally incapable of emitting a record without them.

GitSkills CC-BY-4.0 attribution appears in the repository and in any output derived from the corpus,
with the citation the dataset requires.

## 7. Author rights (`REQ-063`, `ETH-002`)

Authors did not opt in. Correction and removal are **mandatory in Phase 1** — the stakeholder
promoted this from S to M precisely because it shapes the canonical model and the pipeline.

Requests record the request, actor, disposition and timestamp. Removal tombstones (`DEC-015`):
bytes deletable, provenance envelope permanent.

A system that structurally cannot honour a removal request has decided that question in advance,
against the party with the least power in the arrangement.

## 8. Open

| Item | Status |
| --- | --- |
| `RSK-002` | **OPEN** — SkillsMP robots/API. Conservative posture (`DEC-004`); letter drafted, unsent |
| `RSK-004` | **REDUCED** by `DEC-019`, not closed. Residual: we hold unknown-licence bytes during processing |
| Copyleft handling | **ASSUMPTION** — Phase 1 treats copyleft as `redistributable=false`. Since Phase 1 serves nothing, untested. Needs review before any hosting |
