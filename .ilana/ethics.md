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
