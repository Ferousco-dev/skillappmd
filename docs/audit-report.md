# PROCESS COMPLIANCE AUDIT

| | |
| --- | --- |
| Document | `audit-report.md` v1.0 · Phase 07 · `[quality-auditor]` · 2026-08-27 |
| Gate | G7 criteria 3, 5, 6, 8 |
| **Independence** | **NOT INDEPENDENT.** See §0 |

---

## 0. The independence problem, stated rather than glossed

G7 criterion 5 requires an audit *"by someone not on the delivery team"*. **There is no such person.**
This is a solo project (intake Q7), and `[quality-auditor]` is a role this same session adopted.

That is the third time this limitation has bitten: G4 criterion 9 (peer review), G5 criterion 11
(independent test team), now this. Each was recorded as a **waiver, not a pass**, and the pattern is
itself an audit finding: **this project's single largest process weakness is that every check except
one was performed by whoever did the work.**

The one exception matters and is the counterexample worth studying — the **G1 stakeholder review**,
where the user reversed two of my decisions. Neither would have been caught by any test I could
write, because both were consistent implementations of a wrong idea. That is precisely what
independence buys, and it bought it twice in one review.

**Compensating controls**, which are mechanical rather than human and therefore genuinely
independent of my judgement on any given day:

| Control | Why it is not just me checking myself |
| --- | --- |
| Dependency lint, 3 modes | Fails the build. Proven by planting a violation each time |
| Oracle validation | Graded against a corpus **this project did not create** |
| Cross-adapter contract suites | Two implementations sharing nothing but the port |
| Traceability checker in CI | Reports orphans whether or not anyone wants to see them |
| Append-only ledger | Corrections supersede, never overwrite |

---

## 1. The seven quality attributes, scored on evidence

**Absent evidence, the score is `UNVERIFIED` — never "good".**

| Attribute | Score | Evidence |
| --- | --- | --- |
| **Correctness** | **STRONG** | 139/139 mandatory requirements traced to a test; 344/344 executions of 318 distinct cases passing; oracle agreement 97.7% (parser) and 100% (dedup grouping) against a corpus we did not create; byte-identical re-runs at three rungs |
| **Reliability** | **PARTIAL** | Failure injection at row *n* leaves 1..*n*−1 byte-identical; `SIGKILL` resume with no duplicates; retry/DLQ semantics proven. **But: no system has run continuously for any length of time.** MTBF is `UNVERIFIED` and will stay so until something is deployed |
| **Efficiency** | **STRONG** | 10,442 records/s canonical processing; API p95 **0.02 ms** against a 200 ms target; pipeline memory 119 MB against a 128 MB budget; full corpus ingest costed at ~$17 once, ~$2/month |
| **Usability** | **PARTIAL** | All five UI principles assessed against named commands; 10 system tests drive the real CLI; `--json` on every read; `--confirm` on every destructive action; typo suggestions by edit distance. **But: no real operator other than the author has used it.** Task-completion rate is `UNVERIFIED` |
| **Maintainability** | **STRONG** | `skill-core` is pure and dependency-free; layering enforced by lint, not discipline; 8 adapters across 5 ports; the `DEC-027` portability proof passed with `skill-core` and `ingestion` **unmodified** |
| **Portability** | **STRONG** | A SQL store and a plain-map store produce the **same canonical digest byte for byte**; three ObjectStore adapters pass one contract suite; zero dependencies above the connector layer |
| **Reusability** | **MODERATE** | Ports and adapters are reusable by construction. **But nothing has been reused by a second consumer**, so this is a design property rather than a demonstrated one |

Three STRONG, three PARTIAL/MODERATE, one attribute (`Reliability`) explicitly carrying an
`UNVERIFIED` sub-claim. **Nothing scored on impression.**

---

## 2. Standards mapping (criterion 9, Rigour 4 — done anyway)

| Standard | Where it is honoured |
| --- | --- |
| **IEEE 830** — SRS | `docs/SRS.md`: purpose, scope, definitions, references, overall description, specific requirements, traceability |
| **IEEE 1016** — design description | `docs/ARCHITECTURE.md` + 13 subsystem documents: purpose, responsibilities, inputs, outputs, data structures, failure modes |
| **IEEE 829** — test documentation | `docs/test-plan.md`: objectives, scope, strategy, environment, roles, risks, deliverables, exit criteria with actuals |
| **ISO/IEC 12207** — lifecycle processes | Acquisition (`R1` source access), supply, development (G1–G4), operation (`runbook.md`), maintenance (`REQ-095` re-analysis), configuration management (`scm-plan.md`), quality assurance (this phase) |

---

## 3. Defect cause analysis (criterion 8, Rigour 4 — done anyway)

**Counting defects tells you nothing. Categorising their causes tells you what to change.**

| Cause category | Count | Defects | What it says |
| --- | ---: | --- | --- |
| **Fixtures encoded the author's assumptions** | **3** | `DEF-002`, `DEF-003`, `DEF-005` | The single largest category. Every one passed a full unit suite and was exposed only by real data |
| **Planning omission** | **2** | raw storage (G4), `DEF-008` | A requirement existed, the design specified it, **no increment claimed it** |
| Correctness guarantee hid a liveness failure | 1 | `DEF-006` | The suite hung while the idempotency assertion stayed true |
| Untrusted input reached a query | 1 | `DEF-004` | A repository name is third-party content |
| Self-inflicted regression | 1 | `DEF-007` | Caught only by re-running evidence nothing forced me to re-run |

### The two findings that matter

**Fixtures are the dominant defect source (3 of 8, all HIGH or MEDIUM).** In every case I wrote test
data in the shape I had implemented, so the tests agreed with the code and both were wrong. The
control that worked was **grading against data the project did not create** — the GitSkills corpus
and its `dedup_primary` / `frontmatter_valid` oracles. No amount of additional self-written testing
would have substituted.

**Planning omission caused both gate failures.** Neither G4 nor G5 failed on code quality. Both
failed because a requirement was fully specified in the architecture and **never assigned to an
increment**. `ARCHITECTURE.md` §5 listed raw storage as a Phase 1 subsystem; `SOURCE_CONNECTORS.md`
§4 specified `SkillsMPConnector` in detail. **The design was right both times and the plan lost it.**

The remedy is now mechanical rather than attentional: `packages/tools/src/traceability.js` runs in
CI and reports any requirement with no test. `DEF-008` would have surfaced in minutes rather than
weeks.

---

## 4. Compliance findings

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| A1 | **No quality plan existed before construction** (G7 criterion 1) | Medium | Written now, disclosure at the top of `quality-plan.md`. **Not backdated** |
| A2 | **No independent reviewer, tester or auditor** — 3 gate criteria waived | **High** | Structural to a solo project. Compensating controls listed in §0. **Unresolved by design, not by neglect** |
| A3 | Metrics computed only at G7, not per gate | Low | `quality-plan.md` §5 makes it per-gate going forward |
| A4 | `RSK-004` (licence exposure) and `RSK-007` (trust-score reliance) remain open | Medium | Both reduced, neither closable while the system indexes third-party work and could publish judgements |

**No finding was suppressed.** A2 in particular is the kind of thing an audit performed by the
delivery team is structurally tempted to soften, and stating that plainly is the only honest way to
handle auditing one's own work.
