# CODING STANDARD

| | |
| --- | --- |
| Document | `coding-standard.md` v1.0 · Phase 04 · 2026-08-27 |
| Gate | G4 criterion 1 |
| Enforcement | `packages/tools/src/depcheck.js` + `node --test`, run on every change |

Ìlànà's position: *"If a project deviates, the deviation is written into the standard with a
reason. Undocumented deviation is the failure, not deviation itself."* Every deviation below is
measured, not estimated.

---

## 1. Language and runtime

ES modules, Node 22+. `"type": "module"` on every package. No transpiler, no build step: the
source that runs is the source you read.

## 2. Layering (machine-enforced)

```
apps/         composition roots — the ONLY place a concrete adapter may be named
ingestion/    pipeline stages   — imports ports only
connectors/   source connectors — imports ports only
skill-core/   pure domain       — NO I/O, NO vendor SDK, no imports at all beyond node:crypto
ports/        interfaces        — no implementations
adapters/     implementations   — may import vendor SDKs
```

Enforced by `depcheck.js`, which fails the build on: a bare specifier crossing a layer, a
**relative path** crossing a layer, and any import of a **quarantined** package outside its
allowed directory. All three modes are proven by planting a violation and observing the failure.

## 3. Naming

`camelCase` functions and variables · `PascalCase` classes · `SCREAMING_SNAKE` module constants ·
`kebab-case` filenames. Private class fields use `#`. No globals beyond frozen constant objects.

## 4. Comments

Every non-obvious block states **why**, not what, and cites the requirement or decision it serves
(`REQ-###`, `NFR-###`, `DEC-###`, `DEF-###`).

**Measured: 1 comment per 5.1 source lines** across 3,644 lines in 43 files.

> **Deviation from the 1-in-3 guideline, with reason.** The guideline targets languages and eras
> where control flow needed narrating. Here, comment density is deliberately *uneven*: dense where
> a decision is non-obvious or hard-won (`frontmatter.js`'s anchor guard carries a paragraph
> explaining `DEF-005`; `local-queue.js` explains why an absorbed duplicate must be settled), and
> absent where the code states itself (`getJob(id)` needs no comment). Averaging to 1-in-3 would
> mean padding self-evident lines, which lowers signal. **The rule enforced instead: every defect
> fix and every reversed decision carries its reasoning at the site.**

## 5. Line length

**Measured: 142 lines over 100 characters, of 3,644.**

> **Deviation from the 80-character guideline, with reason.** Soft limit **100**, hard limit 120.
> 80 was set for terminals that no longer constrain us, and enforcing it here would split SQL
> statements and long assertion messages across lines in ways that hurt readability. The 142
> exceedances are template literals in report output and assertion messages — both cases where a
> line break costs more than it saves.

## 6. Function length and complexity

Target under ~25 lines. Two functions exceed it materially and both are documented:
`parseMap`/`parseSeq` in `frontmatter.js` are recursive-descent parsers where splitting the loop
would obscure the grammar, and `ApiRouter.handle` is a flat route table.

> **Deviation from the ~10-line guideline, with reason.** 10 lines suits procedural code with
> shared mutable state. A recursive-descent parser's readability comes from the grammar being
> visible in one place.

## 7. Error handling

- **Failures carry a reason.** No bare `throw new Error('failed')`.
- **Errors cite their requirement** where one governs: `REQ-018 violated: …`, `NFR-004 violated: …`.
- **Errors name the offending field**, never a position. `DEF-003` was a positional SQLite bind
  error that cost real diagnosis time; `assertBindable` now names the field.
- **Bad input is data, not failure.** A malformed `SKILL.md` is recorded as `PARSE_FAILED` with a
  reason and is *never* dead-lettered (`INGESTION.md` §1).
- **Transient and permanent failures are distinguished.** 429/500/502/503/504 retry with backoff
  and jitter; 4xx do not. Retrying a permanent failure burns a source's quota for nothing.
- **The API never leaks internals**: stable code, human message, `request_id`.

## 8. Time

All timestamps UTC, RFC 3339. **Clocks are injected, never ambient** — `normalise`, `migrate`,
`LocalQueue` and `JobRecorder` all *throw* when a timestamp is not supplied. This is what makes
`NFR-001`'s byte-identical re-runs possible.

## 9. Determinism

No `Math.random()` and no ambient `Date.now()` in pipeline code. Where randomness is needed
(backoff jitter), the generator is **injected** so tests are reproducible.

## 10. Secrets

Environment or secret store only. Never a literal; never in logs, raw records, canonical records
or API responses. Verified by scan: **0 credential patterns, 0 key material**.

## 11. Tests

Named `TC-### <REQ-###|NFR-###|DOM-###> <what it proves>`, so the traceability matrix is generated
from the tests rather than maintained beside them. **A test asserts the claim in its own name** —
`TC-082` was rewritten at G4-minus-one because it passed without checking its stated claim.

**Ports are tested by a shared contract suite run against every adapter.** Adapters that share an
engine family would hide leaks, so the pair is deliberately maximal: SQL versus plain maps.

## 12. Dependencies

**Zero** in `skill-core`, `ports`, `ingestion`, `adapters` (except the corpus connector) and both
apps. Two exist, both quarantined to `packages/connectors/gitskills/src/` and both batch-only:

| Package | Purpose | Licence |
| --- | --- | --- |
| `parquet-wasm` 0.7.2 | read the CC-BY-4.0 Parquet corpus | Apache-2.0 / MIT |
| `apache-arrow` ^18 | decode the Arrow IPC that `parquet-wasm` emits | Apache-2.0 |

A new dependency requires a `CR`. Both of these did (`CR-005`, `DEC-037`).
