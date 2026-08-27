# QUALITY MANAGEMENT PLAN

| | |
| --- | --- |
| Document | `quality-plan.md` v1.0 · Phase 07 · `[quality-auditor]` · 2026-08-27 |
| Gate | G7 criterion 1 |

---

## 0. A disclosure that belongs at the top

**G7 criterion 1 requires this plan to have been written *before construction began*. It was not.**
It is dated 2026-08-27, after G6.

I will not backdate it or describe the quality practices that *were* followed as though a plan had
existed. What follows is therefore **two documents in one**: an honest reconstruction of the quality
approach actually used (§1–§4), and the plan going forward (§5). Criterion 1 is assessed as
**PARTIAL** in `.ilana/gates/G7.md`, not as met.

The mitigating fact, which is a fact and not an excuse: the *mechanisms* a quality plan would have
mandated were established at G0–G2 and enforced throughout — gates with evidence, an append-only
decision register, review before execution testing, and a constitution forbidding optimistic
reporting. What was missing was the document naming them in one place.

## 1. Quality objectives, as actually pursued

| Objective | How it was pursued |
| --- | --- |
| Correctness before scale | The batch ladder refused to advance a rung until the previous one re-ran byte-identically |
| Claims must be provable | *"The test actually proves the claim"* — four tests were rewritten for passing without checking their own claim |
| Prevention over detection | Review gates at G1, G2, G3 **before** execution testing (Article 5) |
| Honest reporting | Article 2. Three gates were failed by their own owner rather than passed |
| Third-party fairness | `ETH-001`: no adverse judgement published on a contested reading |

## 2. Review strategy, and how risk selected the type

Ìlànà: *walkthrough for low risk, inspection for high.* What was actually applied:

| Artefact | Type | Risk | Yield |
| --- | --- | --- | --- |
| SRS v1.0 | **Stakeholder inspection** | High — every downstream artefact derives from it | 2 analyst choices reversed, 13 invented numbers disclosed, 8 gaps found |
| SRS adjectives | **Automated inspection** | High — an unmeasurable requirement is undetectable later | 2 defects (`REQ-015`, `REQ-097`) |
| Requirements conflicts | Inspection | High | 2 conflicts → `DEC-015`, `DEC-016` |
| Design coverage | **Automated orphan check** | High | 3 requirements with no design |
| Interface coverage | Automated orphan check | Medium | 5 user-facing requirements with no `UI` element |
| Code | Continuous automated | High | dependency lint, 3 enforcement modes, each proven by planting a violation |
| Traceability | **Automated audit** | High | `DEF-008` — a falsely-covered requirement |

**Automation is doing the inspecting.** With one person, a human inspection is the same person
reading their own work an hour later. A lint that fails the build does not get tired, does not
rationalise, and — critically — **fails the same way tomorrow**.

## 3. What was reviewed before any code ran

**8 findings from review, before execution testing of the code they concerned.** This is Article 5
in practice: a defect found in a requirements review costs a fraction of the same defect in
production.

The most valuable was not a code defect at all. The G1 stakeholder review reversed two of my own
decisions — `DEC-018` (collapsing `unknown` rights into false booleans) and `DEC-019` (retaining
unlicensed content indefinitely). Neither would have been caught by any test, because both were
*consistent implementations of a wrong idea*.

## 4. Defect management

Nine fields per defect, lifecycle state, and — the part that matters — **cause analysis, not
counting** (§ `docs/audit-report.md` §3).

## 5. Going forward

| Practice | Trigger |
| --- | --- |
| This plan is written **before** the next phase's construction | Phase 2 |
| Every new detector is proven against a planted violation | on creation |
| Every gate failure records what the gate caught, not just that it failed | every gate |
| Metrics recomputed at each gate, not only at G7 | every gate |
| A second reviewer, when a second person exists | on team growth |
