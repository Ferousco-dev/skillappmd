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
