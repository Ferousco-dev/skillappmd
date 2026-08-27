# DEFECT LOG

## DEF-001 — Completing a job overwrote its start time (and crashed on the bind)
**Found:** 2026-08-27, phase 04 increment 4, by `TC-085`..`TC-089` · **Severity: MEDIUM** · **Status: CLOSED**
**Requirement:** `REQ-017` · **Component:** `packages/ingestion/src/job-recorder.js`, `adapters/sqlite`

**Symptom.** Five tests failed with `Provided value cannot be bound to SQLite parameter 7`.

**Surface cause.** `JobRecorder.succeed()` spread the caller's job object, which did not carry
`startedAt`; `undefined` reached the bind and `node:sqlite` rejected it.

**Actual defect, found by looking past the symptom.** The upsert's `ON CONFLICT` clause would have
overwritten `started_at` on every completion. Had the caller supplied *any* value, the crash would
have vanished and the real fault would have shipped silently: **a job's duration would have been
permanently unmeasurable**, because completion kept resetting the start.

That directly undermines `REQ-083` (processing latency per stage) and `NFR-011`'s eventual measured
performance target — the metrics would have existed and been wrong, which is worse than absent.

**Fix.**
1. `recordJob`'s `ON CONFLICT` deliberately does **not** update `started_at`. Starting a job sets
   it; completing one must not move it.
2. `JobRecorder` gained a private `#complete()` so a job is completed **by identity**, without the
   caller restating fields the store already owns.

**Regression tests:** `TC-091` (start time preserved across completion), `TC-092` (completion by
identity alone).

**Lesson recorded.** The crash was a gift. A bind error is loud; a silently-reset timestamp is not.
Fixing only the symptom — defaulting `startedAt` at the call site — would have passed the tests and
left the real defect in place.

---

## DEF-002 — Parser rejected YAML block scalars, failing 1 in 9 real SKILL.md documents
**Found:** 2026-08-27 by oracle validation against the corpus · **Severity: HIGH** · **Status: CLOSED**
**Requirement:** `REQ-035`, `REQ-041`, `NFR-003` · **Component:** `packages/ingestion/src/frontmatter.js`

**Symptom.** Parser oracle agreement was **83.7%** against `frontmatter_valid`, well under
`NFR-003`'s 99% target, with 5 outright parse failures in a 43-document comparable sample.

**Cause.** The parser handled `key: value` and nested maps but not **block scalars** —
`description: >`, `>-`, `|`, and the implicit form where `description:` is followed by indented
prose. Encountering one, it treated the key as opening a nested map and then rejected the
continuation line as "not a key/value pair".

**Why it mattered more than it looked.** Descriptions are the longest field in a `SKILL.md` and
the spec caps them at 1024 characters, so authors routinely wrap them in block scalars. This was
not an edge case; it was **the common shape of a well-written skill.** Unit tests written from the
spec all passed, because I had written the fixtures in the style I had implemented.

**Only real data exposed it.** That is the argument for `REQ-047`/`NFR-003` existing at all: a
suite that grades itself will agree with itself.

**Fix.** Implemented `|`, `>`, with `-`/`+` chomping, plus implicit multi-line plain scalars,
bounded by the same limits as everything else (`MAX_SCALAR`, `MAX_LINES`).

**Result.** 83.7% → **97.7%** agreement, **0 parse failures**.
**Regression test:** `TC-109` covers all four shapes and asserts folding versus literal semantics.
