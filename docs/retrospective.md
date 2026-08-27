# RETROSPECTIVE — Phase 1

| | |
| --- | --- |
| Document | `retrospective.md` v1.0 · Phase 08 · `[conductor]` · 2026-08-27 |
| Gate | G8 criteria 4, 5 |
| Scope | G0 through G7. 25 commits, 11 increments, 8 gates |

Ìlànà: *"Not a feelings exercise. Four questions, each answered with evidence."*

---

## 1. What did the process catch?

**8 findings from review gates, before the code they concerned had run.**

| Gate | Finding | What it would have cost later |
| --- | --- | --- |
| G1 adjective test | `REQ-015` *"independently scalable"*, `REQ-097` *"simple abstraction"* | An unmeasurable requirement cannot fail a test. Both would have been silently "met" forever |
| G1 conflict analysis | Raw immutability vs deletability | Discovered at the first removal request — with no design for it and an author waiting |
| G1 conflict analysis | 208 MB shard vs 128 MB worker | Discovered at first bulk ingest, mid-run, out of memory |
| G2 orphan check | `REQ-018`, `REQ-047`, `NFR-030` had no design element | Three requirements shipped as "done" without anyone designing them |
| G3 orphan check | `REQ-064`–`067`, `REQ-069` had no `UI` element | The API's own contract unspecified |
| **G1 stakeholder review** | **`DEC-018` and `DEC-019` reversed** | See below — the single most valuable finding of the project |

**The two reversals are the ones that matter.** `DEC-018`: I had collapsed the brief's `unknown`
rights state into all-false booleans. `DEC-019`: I had retained full content for every occurrence
including unlicensed material.

Neither would have been caught by any test I could write, **because both were consistent
implementations of a wrong idea.** The code would have been correct against the design, the design
correct against my reading, and the reading wrong. Measured later: **68.7% of real records resolve
to `unknown`** — so `DEC-018` alone would have destroyed the distinction between *"known not
redistributable"* and *"not known"* across two thirds of the corpus.

Cost avoided is not guessable in money, but it is nameable: a licensing posture that was wrong about
most of the dataset, discovered by someone outside the project.

## 2. What did the process miss?

**Every defect found late is a gate that did not bite. Named honestly:**

| Missed | Which gate should have caught it | Why it did not |
| --- | --- | --- |
| Raw storage absent (G4 fail) | **G2 design → increment planning** | `ARCHITECTURE.md` §5 listed it. `ROADMAP.md` §2 never assigned it an increment. **No gate compared the subsystem list to the increment list** |
| `SkillsMPConnector` absent (G5 fail) | **Same** | `SOURCE_CONNECTORS.md` §4 specified it in full. Same omission, same gap |
| `DEF-006` consumer hang | G4 construction | Tests asked *"did the handler run once?"*, never *"did the consumer finish?"* |
| `DEF-002/003/005` parser gaps | G4 construction | Fixtures written in the shape the code was written. Tests and code agreed and were **wrong together** |
| `RSK-002` carried open all project | **Any gate after G0** | I never re-tested an assumption once cheap evidence existed. It took the user asking |

**The pattern is one thing, not five.** In four of these, something was *specified correctly and
then not checked against reality* — the increment plan against the architecture, the tests against
real data, the assumption against a live API. The process was strong at producing correct
descriptions and weak at confirming the description matched the world.

## 3. Where did the process cost more than it returned?

Honest accounting. Not everything earned its place.

| Practice | Verdict |
| --- | --- |
| Gate records with evidence tables | **Earned it.** Three gates failed by their own owner; without written criteria they would have passed on vibes |
| Adjective test | **Earned it.** Two real defects, seconds to run |
| Orphan checks (both directions) | **Earned it.** 8 findings, and it eventually caught `DEF-008` |
| Decision register (39 `DEC`) | **Earned it**, unevenly. The reversals and trade-offs are load-bearing; a handful record things nobody would have questioned |
| Per-increment ledger narrative | **Marginal.** Genuinely useful for `DEF-007`-style regressions where "what changed" mattered. But some entries restate the commit message at length |
| 92 `DES` elements | **Marginal at this scale.** The mapping caught 3 orphans. For a solo Phase 1 the same result might have come from a checklist a tenth the size |
| Formal `HANDOFF` blocks between role rotations | **Did not earn it.** With one context and one person, the handoff is ceremony — it produced no finding in eight phases |

**Trim for next run:** handoff blocks, and shorter ledger entries where the commit already says it.
**Do not trim:** anything automated. Every automated check found something; the manual ceremony is
where the waste was.

## 4. The one change carried into the next run

> **Every subsystem named in the architecture must be assigned to an increment before construction
> begins, and the mapping is checked mechanically.**

**Owner:** `[conductor]` · **Starts:** Phase 2 planning · **Metric:** subsystems-without-an-increment, target **0**, checked at the phase-02 gate and in CI.

**Why this one.** Both gate failures — the only two in the project — had this identical root cause.
Not a code failure, not a test failure: a **plan** that lost a subsystem the design had specified.
`traceability.js` now catches requirements without tests; nothing yet catches *subsystems without
increments*, and that is the gap that cost two gate attempts.

Concretely, `ARCHITECTURE.md` §5 already contains the subsystem table with ✅/⚠/❌ markers.
`ROADMAP.md` §2 already contains the increment table with requirement ranges. **Nothing compares
them.** A twenty-line script would have prevented both failures.

---

## The closing number

```
findings from review, before the code ran      8
defects found during construction              7
defects found at verification (G5)             1
defects found after release                    0
```

**That last zero proves nothing yet, and saying so is the point.** Nothing is deployed. The number
becomes meaningful only after Phase 2, and it is recorded now precisely so the comparison is
possible then.

The meaningful ratio today is the second one: **7 of 8 defects were caught during construction
rather than at verification.** Prevention worked. The single escape to verification, `DEF-008`, was
the planning omission — which is exactly what §4's change addresses.
