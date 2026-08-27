# ETHICS REGISTER

## ETH-001 — Trust and security scores published about third parties' code
**Raised:** 2026-08-27 · `[ethics-officer]` · **Status: OPEN, non-blocking at G0, BLOCKING at G2**
**Constitution:** Article 1 (public interest supreme), Article 2 (truthful reporting).

Brief §18 requires AppMD to publish `trust_score` and `risk_level` for code AppMD did not write
and cannot execute. Two harms, in opposite directions, both real:

- **False positive** — a safe skill is scored risky. Reputational harm to an author who has no
  relationship with AppMD, no notice, and no route of appeal.
- **False negative** — a malicious skill is scored safe. A developer relies on that score and
  ships the compromise. This is the more serious of the two, because AppMD's score *caused* the
  reliance that the author's own README would not have.

SkillsMP's own posture is instructive and is the floor, not the ceiling: it *"does not endorse or
verify the quality, safety, or functionality of any skill."*

**Conditions the ethics-officer will require before G2 passes:**
1. Every score is accompanied by its **findings and their evidence**. A bare number is forbidden.
2. Scores are framed as **signals for review**, never as certification, clearance or a guarantee
   of safety. Brief §18 already states this; it becomes a gate criterion, not a footnote.
3. **Absence of findings is reported as absence of findings**, never as "safe".
4. A **stated appeal/correction route** for authors exists before any score is publicly exposed.
5. Analyser version and timestamp travel with every score, so a stale verdict is identifiable.
6. Security findings are **AppMD inference**, never source fact (brief §12) — provenance must
   make this machine-readable, not merely a disclaimer in prose.

**This is not a veto.** It is a set of gate criteria. The feature proceeds; it proceeds with these.

## ETH-002 — Attribution and author control
**Status:** folded into `DEC-006` and tracked as `RSK-004`.
Authors did not opt in to AppMD indexing. Attribution and canonical source URL are therefore
**mandatory fields, not optional metadata**, and any redistribution decision defaults to deny.

---

## Closure review — 2026-08-27, G8 criterion 9

### `ETH-001` — trust and security scores about third parties' code — **DISPOSITIONED**

**Raised at G0 as blocking at G2. Conditions met in design at G2, verified against the running
implementation at G4.** All six executed against a live API response, not asserted from the design:

| Condition | Verified |
| --- | --- |
| Score accompanied by findings and evidence | **No numeric score field exists at all** — a bare score is not representable |
| Framed as a signal, never certification | `notice` carries *"does not certify or verify any skill"* |
| Absence of findings ≠ "safe" | The word does not appear in any response |
| A stated appeal route before public exposure | `RemovalService`, `REQ-063`, mandatory in Phase 1 |
| Analyser id, version and timestamp travel with every score | `assertInference` throws without them |
| Findings are AppMD inference, machine-readably | `appmd_inference:` in `field_origins`, on the wire |

**Status: conditions met. The underlying risk (`RSK-007`) remains deferred**, because conditions
being met is not the same as the risk being gone — it means the risk is *governed*. Phase 1
publishes no score, so nothing has yet been tested against a real author's objection.

### `ETH-002` — attribution and author control — **DISPOSITIONED**

Authors did not opt in to being indexed. What was built rather than promised:

- Attribution is a **write-time invariant** — a record without it cannot be stored (`NFR-004`)
- **100%** of canonical records carry repository, owner and canonical source URL
- Removal is **mandatory in Phase 1** (`REQ-063`), promoted from S to M at the user's direction
  precisely because it shapes the data model
- Removal deletes **real bytes** while the provenance envelope and attribution survive (`DEC-015`)
- Personal data limited to provenance necessity; a person-linked field without a stated purpose is
  **not stored** (`REQ-092`)

**Status: implemented and tested.** `TC-231` proves an author removal deletes real bytes; `TC-183`
proves attribution survives it.

### The ethics finding that was not raised as one

Recorded here because closure is where it belongs. **`DEC-018` and `DEC-019` — both reversed by the
user at G1 — were ethics findings wearing engineering clothes.**

Collapsing `unknown` rights into all-false booleans, and retaining unlicensed content indefinitely,
were not merely technical errors. Each would have shaped how AppMD treats work belonging to people
with no relationship to this project. Neither was flagged by `[ethics-officer]`; both were caught by
a stakeholder reading the SRS.

**Lesson for the next run:** the ethics register should be reviewed against the *data model*, not
only against features that obviously look ethical. `DOM-008` was a data-shape decision with an
ethical consequence, and no gate criterion asked that question.
