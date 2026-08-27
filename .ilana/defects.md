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

---

## DEF-003 — A non-scalar frontmatter value crashed the canonical write 300 rows into a run
**Found:** 2026-08-27 by dedup oracle validation on real data · **Severity: MEDIUM** · **Status: CLOSED**
**Requirement:** `REQ-039`, `NFR-022` · **Component:** `normaliser.js`, `adapters/sqlite`

**Symptom.** `TypeError: Provided value cannot be bound to SQLite parameter 7` — a positional
error, mid-run, naming nothing.

**Cause.** One real document (`Theboul/smart_mechanic-frontend`) writes `description:` with an
indented map beneath it. Our parser correctly returns an object; the indexed
`declared_description` column can only bind a scalar.

**Why the unit tests missed it.** Every fixture I wrote gave `description` a string, because that
is what a description *is*. The corpus contains a document where it is not. **This is the same
lesson as `DEF-002`, arriving by a different route: fixtures encode the author's assumptions, and
real data does not share them.**

**Fix, at both layers (`DEC-031`).**
1. `normaliser` coerces `name`/`description` to a scalar or `null` for the indexed columns; the raw
   value is preserved verbatim in `declared.frontmatter` (`REQ-036` is not compromised).
2. `upsertCanonical` validates bindability first and **names the offending field** —
   `cannot store field "declared.name": expected a scalar, got object`. This write path will be
   reached by future bulk loaders and adapters that never touch the normaliser, and a positional
   SQLite error costs far more to diagnose than a named one.

**Regression tests:** `TC-134` (real shape ingests, column null, raw value preserved),
`TC-135` (the store names the field).

---

## DEF-004 — A third-party repository name reached a query expression and broke it
**Found:** 2026-08-27 at the 1,000 rung · **Severity: HIGH (security-relevant)** · **Status: CLOSED**
**Requirement:** `NFR-021`, `REQ-024` · **Component:** `packages/connectors/gitskills/src/repo-licence-reader.js`

**Symptom.** The ladder halted at rung 1,000 with `HTTP 422: Parameter 'where' contains errors or
invalid symbols` — correctly *not* retried, since 422 is permanent.

**Cause.** One real repository:

```
Michaelunkai/study--AI_ML-AI_and_Machine_Learning-Artificial_Intelligence-openclaw
```

GitHub permits repeated hyphens, so this is a legal repository name. **`--` is a SQL comment
marker.** The name was interpolated into the `where` clause, and everything after `--` became a
comment.

**Why this is a security finding and not a formatting bug.** `NFR-021` says third-party content is
untrusted at every stage. **A repository name is third-party content**, and it was reaching a query
language. We were fortunate in the failure mode: the service's parser was strict and returned 422.
**A more permissive parser would have silently returned the wrong rows** — licences attributed to
the wrong repositories, with no error anywhere. Wrong licence data is precisely the failure this
project cannot afford (`RSK-004`).

The pattern generalises: any identifier that arrives from a source and is composed into a query,
path, or command is an injection surface. This one was read-only against someone else's service;
the next one might not be.

**Fix.** There is no parameterised form of this API, so the only safe posture is to **refuse to
build a query from a name we cannot express**. `isQueryableName()` rejects `--`, `/*`, `*/`, quotes,
backticks, semicolons, backslashes and control characters. Rejected names are **recorded and
reported** (`REQ-085`), never silently dropped.

**The safe failure mode turned out to be the correct one.** An unqueryable name yields no L2
licence, which resolves to rights `unknown` — already the conservative default (`DEC-018`). Nothing
special had to be invented for the error path; the existing design absorbed it.

**Regression tests:** `TC-165` (the real name plus classic injection shapes are refused; ordinary
names unaffected), `TC-166` (an unsafe name produces `null`, is reported, and **generates zero
requests**).

**Also observed in the same scan, and handled correctly by existing code:** transient
`500 "dataset index is loading"`, `500 "Authentication check ... temporary internal issue"` and
`504 Gateway Time-out`. All are retried with backoff by `fetchWithRetry`; only the 422 was
permanent. The retry taxonomy from increment 7 earned its keep here.

---

## DEF-005 — Parser rejected legitimate real-world YAML; the security guard produced false positives
**Found:** 2026-08-27 at the 1,000 rung · **Severity: HIGH** · **Status: CLOSED**
**Requirement:** `REQ-035`, `REQ-036`, `REQ-037`, `NFR-021` · **Component:** `frontmatter.js`

**Symptom.** 9 parse failures in 438 real documents (2.1%).

**Four distinct causes, all ours:**

| # | Shape | Why it failed |
| --- | --- | --- |
| 1 | Sequence of maps — `arguments:` then `- name: x` with sibling keys | only scalar list items were supported |
| 2 | Plain scalar wrapping onto indented lines — the common `description:` shape | continuation lines were read as key/value pairs |
| 3 | Block sequence at the parent's indent (`edam_topics:` then `- ...` at the same column) | items were expected to be more indented; YAML permits either |
| 4 | **`*SummarizedExperiment*` in prose rejected as a YAML alias** | the anchor guard matched any whitespace-preceded `&`/`*` |

**Cause 4 is the one worth dwelling on.** A security guard that rejects legitimate documents is a
defect that **looks like a win** — the failure reads as "we refused something dangerous", so nobody
investigates. Markdown emphasis is ordinary prose in a description field, and we were refusing to
index any skill that used it.

Anchors and aliases occupy a **value position** — `key: &a x`, `- *a` — so the guard now inspects
the value after a `key:` or `- ` marker rather than scanning raw text. `TC-167` asserts that
`*emphasis*` and `R&D` parse while genuine anchors, aliases and tags are still refused.

**Fix.** The parser was rewritten as a recursive-descent block parser over an explicit line cursor
(`parseMap` / `parseSeq`), which handles all four shapes. All limits retained: 12-deep nesting,
500 keys, 8 KB scalars, 2,000 lines, prototype-pollution guard.

**Result: 9 failures → 2**, and both remaining are genuinely malformed documents that *should*
fail — an unclosed fence, and a stray quote left by an unbalanced multi-line string. Structural
oracle agreement **97.7% over 438 records**.

**Regression tests:** `TC-167` (emphasis vs real anchors), `TC-168` (sequence of maps),
`TC-169` (wrapped scalar), `TC-170` (sequence at parent indent), `TC-171` (wrapped sequence item),
`TC-172` (the two documents that should still fail).

**Lesson, the third time in this project.** `DEF-002` and `DEF-003` were both "fixtures encode the
author's assumptions". This is the same, sharpened: **I wrote a YAML subset by imagining what
`SKILL.md` files look like.** 438 real documents disagreed four separate ways, and no amount of
unit testing against my own fixtures would have surfaced any of them.

---

## DEF-006 — An absorbed duplicate was never settled, so the consumer looped forever
**Found:** 2026-08-27 in increment 10 · **Severity: HIGH (liveness)** · **Status: CLOSED**
**Requirement:** `REQ-016`, `REQ-022` · **Component:** `packages/adapters/local-queue/src/local-queue.js`

**Symptom.** The increment 10 test file hung with no output. Not a failure — a hang.

**Cause.** When the idempotency ledger absorbed a duplicate delivery, the code did the right thing
about the *handler* — skipped it — and then `continue`d **without marking the message done**. The
message stayed `ready`, so the next `consume()` poll selected it again, absorbed it again, and
looped indefinitely.

**Why every existing test passed.** `TC-076` asserts every duplicate is absorbed and no key is
processed twice. That assertion was **true throughout the hang** — the handler genuinely never ran
again. The idempotency *guarantee* held perfectly while the consumer never terminated.

**A liveness bug hiding behind a correctness guarantee.** The tests asked "did the handler run
exactly once?" and never asked "did the consumer finish?". Those are different questions, and only
the second one fails here.

It surfaced only because increment 10's re-analysis enqueues the *same* idempotency key twice by
design — a repeated trigger is the expected case for `REQ-095`, not an edge case.

**Fix.** An absorbed duplicate is now marked `done` alongside incrementing its delivery count.

**Regression test:** `TC-193` asserts the handler runs once **and** that both messages are settled
**and** that `consume()` terminates, with a 4-second race guard so a recurrence fails loudly
instead of hanging the suite.

---

## DEF-007 — Incremental indexing on the canonical write path breached `NFR-014`
**Found:** 2026-08-27 during increment 11 verification · **Severity: MEDIUM** · **Status: CLOSED**
**Requirement:** `NFR-014` · **Component:** `packages/ingestion/src/deduplicator.js`

**Symptom.** After wiring the derived index, the 10,000-record ladder reported **128 MB delta —
over budget**, against 85 MB before the increment.

**Found by re-running existing evidence, not by review.** The unit tests all passed; only the
ladder — an artefact from increment 9b that nothing forced me to re-run — showed it.

**Two causes, one real.**
1. `resolveOccurrence` re-read each row with `getCanonical()` immediately after writing it,
   allocating a full row object per record. Removed; **it was not the main driver** (128 → 131 MB,
   which is noise). Recorded because assuming it was the cause and stopping there would have left
   the real problem in place.
2. **The real cause: indexing on the canonical write path at all.** `DATABASE.md` §46 already says
   *"Skill imported → Database updated → Search index updated later."* I had coupled them.

**Fix.** Indexing moved off the ingest path entirely; `rebuildSearchIndex()` is the single way the
index is built, which is also the recovery path — one mechanism rather than two that can disagree.
`ingestRecord` takes an opt-in `indexOnWrite` for callers that need immediate search correctness.

**Result: 119 MB, within budget.** Headroom is genuinely smaller than the pre-increment 85 MB; the
difference is the `raw_objects` rows, which are the point of the increment and are recorded here
rather than glossed.

**Also caught, in my own verification script rather than in shipped code:** a check reading the
first 150 rows of the extracted corpus concluded "search works: false". Those rows are stratum 0 —
the ~10-byte files with no frontmatter — so every haystack was empty and zero hits was correct.
**The head-sampling error `DEC-024` exists to prevent, walked into again in an ad-hoc script.**
Re-run with a stride: 240 records, 79 with declared names, search returns hits.

---

## DEF-008 — `SkillsMPConnector` (`REQ-004`, priority M) was never implemented, and a test title concealed it
**Found:** 2026-08-27, phase 05 traceability audit · **Severity: HIGH** · **Status: OPEN — blocks G5**
**Requirement:** `REQ-004` (M), and `REQ-005`, `REQ-014`, `REQ-025`, `REQ-028` alongside it

**What is absent.**

| Req | Pri | Statement | Status |
| --- | --- | --- | --- |
| `REQ-004` | **M** | `SkillsMPConnector` using only documented REST and MCP endpoints | **ABSENT** |
| `REQ-028` | **M** | Skip re-fetch when the source reports content unchanged (ETag / `lastmod` / commit sha) | **ABSENT** |
| `REQ-005` | S | `GitHubConnector` | ABSENT |
| `REQ-014` | S | Poll the SkillsMP RSS feed | ABSENT |
| `REQ-025` | S | Circuit breaker | ABSENT (abstraction described, never built) |

**How it stayed hidden — the part that matters.** `TC-260` was titled
*"REQ-004/DOM-012 every connector declares an enforceable access policy"* and exercised only
`GitSkillsCorpusConnector`. The traceability matrix is generated from test titles, so `REQ-004`
read as covered. **A test naming a requirement it does not exercise is worse than an uncovered
requirement: an uncovered requirement is visible, a falsely-covered one is not.**

This is the same shape as G4's raw-storage failure, arriving through a different door. There, a
graceful degradation (`bytes deleted false`) hid an absent subsystem. Here, a test title did.

**Fix applied to the concealment.** `TC-260` retitled to what it actually proves (`DOM-012`,
`REQ-006`), with a note recording why. An audit across every test title that names a requirement
found **no other instance**.

**Not fixed: the absent connectors.** Implementing them is not a defect fix; it is scope, and it
needs a decision rather than a silent build.

**Assessment against G5.** Criterion 3 requires every `REQ` and `NFR` to map to a test. Two
**mandatory** requirements have no implementation to test. **G5 cannot pass on the current
evidence**, and the honest response is to report it rather than to write a test that asserts an
absence and call the box ticked.

### RESOLUTION — 2026-08-27

Both **mandatory** requirements are now implemented and tested.

| Req | Pri | Built | Tests |
| --- | --- | --- | --- |
| `REQ-004` | **M** | `SkillsMPConnector` — REST discovery, access policy as data, GitHub coordinates as identity, `getContent()` returns `NotAvailable` by design | `TC-299`–`TC-309` |
| `REQ-028` | **M** | `ConditionalFetcher` — `If-None-Match` / `If-Modified-Since`, plus a version-ref short circuit that skips the request entirely | `TC-313`, `TC-314` |
| `REQ-025` | S | `CircuitBreaker` with half-open probing, wired into the connector | `TC-310`, `TC-311` |
| `REQ-096` | M | `RobotsPolicy` — parses directives, separates `crawl` from `api` channel | `TC-312` |

Tests run **offline against fixtures recorded from the live API**, so the shapes asserted are the
shapes SkillsMP actually returns — not shapes I imagined. That distinction has now mattered five
times in this project.

**Still absent, both priority S, and left absent deliberately:** `REQ-005` (`GitHubConnector`) and
`REQ-014` (RSS polling). Neither is needed for Phase 1: the corpus supplies content and L2 licences
(`R2`), and incremental discovery has no consumer yet. Recorded as orphans by the traceability
checker rather than hidden, so the next person sees them.

**`DEF-008` status: CLOSED** for the mandatory scope; the two S-priority absences carry forward as
declared gaps.

**Note on `RSK-002`.** `REQ-004`'s absence has one accidental benefit worth recording: no live
SkillsMP call has ever been made from this codebase, so the unresolved robots-versus-API question
has not been acted on either way.

---

## `DEF-009` — the portability proof shares an assumption neither adapter can violate

**Found:** 2026-08-27, first hour of Phase 2 deployment work · **Severity:** HIGH
**Status:** OPEN · **Against:** `DEC-027`, `DATABASE.md` §8, `NFR-027`

### The claim

`DATABASE.md` §8 states a falsifiable test: *"the Postgres adapter can be written, and the full
test suite pass against it, without editing one line in `skill-core/` or `ingestion/`."* `DEC-027`
describes the SQLite → D1 move as **"a driver swap"**. G4 accepted both on the strength of
`MemoryCanonicalStore`: zero SQL, same pipeline code, identical canonical digest.

### The defect

**The `CanonicalStore` port is entirely synchronous, and so are both adapters that "proved" it.**
`node:sqlite` is synchronous. A `Map` is synchronous. The proof compared two synchronous
implementations and concluded the port was implementation-independent.

**D1's client API is asynchronous** — `stmt.first()`, `.all()`, `.run()` all return Promises
(verified against Cloudflare's documentation, 2026-08-27). PostgreSQL drivers are asynchronous too.

There are **zero `await`s on the store** anywhere in `packages/ingestion/src` or `apps/api/src`.
`resolveOccurrence()` and `ApiRouter.handle()` are synchronous functions that return values
directly. A D1 adapter cannot satisfy this port. The stated falsifiable test **fails** — and it
fails at the first real attempt to use it, which is exactly what it was written to detect.

### Why the existing controls did not catch it

`depcheck.js` enforces *dependency direction*. The contract suite enforces *behavioural
equivalence*. Neither can see an **I/O shape** assumption, because both adapters make the same one.
Two implementations agreeing proves less than it appears to when they were chosen for convenience
rather than for difference — the memory adapter was written to have no SQL, not to have different
timing.

**This is the G8 finding again in a new costume.** `C1` was a count nobody verified; this is a
claim nobody could falsify with the adapters on hand. The lesson is the same: an assertion is only
worth what the attempt to break it cost.

### What is NOT wrong

The port genuinely leaks no SQL. `MemoryCanonicalStore` has none and passes everything. That half
of `NFR-027` holds and is worth keeping — it is why the fix is mechanical rather than a redesign.

### Blast radius if the port goes async

43 store call sites in domain and application code, 15 test files. `skill-core/` is untouched (it
is pure; it never sees a store), so `DEC-027`'s deeper claim — that the *domain* is portable —
survives.

### Disposition

Open pending the user's decision on `CR-008`. Deployment is blocked on it: there is no correct
D1 adapter to write until the port's shape is settled.

**CLOSED 2026-08-27** by `CR-008`. Port and all callers asynchronous; `DeferredMemoryCanonicalStore`
added so the contract suite contains an adapter synchronous code cannot satisfy (`TC-330`). It runs
the full contract suite AND the whole ingestion pipeline (`TC-253 [deferred+memory]`). 370/370
passing; ladder byte-identical at every rung.
