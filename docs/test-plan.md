# TEST PLAN

| | |
| --- | --- |
| Document | `test-plan.md` v1.0 · Phase 05 · `[verifier]` · 2026-08-27 |
| Shape | IEEE 829 |
| Gate | G5 criterion 1 |

---

## 1. Objectives

Establish that the Phase 1 system does what `docs/SRS.md` v1.1 says, and that the claims made about
it are **provable rather than asserted**. The standard applied throughout:

> the requirement exists **+** the implementation exists **+** the test exists **+**
> **the test actually proves the claim**.

The fourth clause has done the most work. Four separate tests in this project passed while proving
nothing (`TC-082`, `TC-152`, `TC-260`, `TC-297`), and each was rewritten rather than counted.

## 2. Scope

**In:** every `REQ`, `NFR` and `DOM` in SRS v1.1 at priority M or S; the four test levels; the
non-functional properties of the repository itself.

**Out:** priority-F requirements (`REQ-049`, `073`, `074`, `081`, `087`) — future phases, no
implementation to test, and asserting their absence would be theatre. Live R2 (`DES-019` is a
boundary; live verification needs infrastructure Phase 1 does not have and is **not claimed**).

## 3. Strategy — four levels

| Level | Question | Where | Count |
| --- | --- | --- | --- |
| **Unit** | is each component correct alone? | `skill-core`, parser, licence, identity | ~130 |
| **Integration** | do the modules talk correctly across ports? | `ingestion/test/integration.test.js` | 14 |
| **System** | does the whole thing meet the SRS? | `apps/cli/test/system.test.js` — the real CLI as a child process | 10 |
| **Acceptance** | does it satisfy the brief? | operator-run evidence on real corpus data | see §9 |

Ìlànà's warning at this gate is taken literally: *"a project with 90% unit coverage and no
integration level is not well tested."* The system level runs the CLI as a **child process**, so
argument parsing, exit codes, confirmation guards and output formatting are in scope — the parts
unit tests structurally cannot reach.

**Cross-adapter contract testing** is used wherever a port exists, deliberately pairing
implementations that share *nothing* but the interface: a SQL store against plain maps, a
filesystem object store against an in-memory one. Two adapters from the same family would hide a
leak; `TC-201` caught a real divergence precisely because they were not.

## 4. Environment

Node 22, offline. No cloud account, no paid plan, no network (`NFR-016`, `NFR-030`). Zero runtime
dependencies outside the two quarantined batch-only packages. Corpus evidence uses a fetched slice
under `data/corpus/`, gitignored.

## 5. Roles

Solo project. `[verifier]` is a role rotation, not an independent person — recorded as a **waiver**
at G4 criterion 9 and unchanged here. Compensating controls: machine-enforced layering with three
proven failure modes, cross-adapter contract suites, and oracle validation against a corpus this
project did not create.

## 6. Risks to the testing itself

| Risk | Control |
| --- | --- |
| A test passes for the wrong reason | Every detector is verified against a **planted violation** (`TC-277`, `TC-283`, `TC-297`) |
| A test title claims a requirement it does not exercise | `packages/tools/src/traceability.js` in CI; this is how `DEF-008` was found |
| Fixtures encode the author's assumptions | Oracle validation against the real corpus. `DEF-002`, `DEF-003` and `DEF-005` were all found this way and by nothing else |
| Head-sampling produces plausible wrong numbers | Stratified sampling (`DEC-024`); it has still caught me twice in ad-hoc scripts |
| Green suite hides a missing subsystem | G4 found raw storage absent; G5 found `SkillsMPConnector` absent. Both by traceability, not by tests |

## 7. Deliverables

`.ilana/traceability.csv` · `.ilana/defects.md` · `.github/workflows/verify.yml` ·
`packages/tools/src/traceability.js` · this plan · `.ilana/gates/G5.md`

## 8. Exit criteria, with actuals

| # | Criterion | Target | Actual |
| --- | --- | --- | --- |
| 1 | Test plan exists | yes | this document |
| 2 | Unit tests pass | 100% | **344/344 executions of 318 cases** |
| 3 | Every `REQ`/`NFR` maps to a `TC` | no orphans | **139/139 mandatory. 2 orphans remain, both priority S and declared (`DEC-039`)** |
| 4 | Integration covers module boundaries | every port | 14 tests, every port, 3 adapter combinations |
| 5 | System testing against the SRS | yes | 10 tests, CLI as a child process |
| 6 | Defects recorded with lifecycle | all | 8 recorded, **8 closed** |
| 7 | Exit criteria met or shortfall explicit | explicit | this table |
| 8 | Regression suite automatic | CI | `.github/workflows/verify.yml` |
| 9 | Non-functional testing | per NFR | 16 tests: security, portability, cost, scale — each detector proven against a planted violation |
| 10 | Acceptance signed by a user, not the dev team | signed | **NOT MET — requires the user** |

## 9. Acceptance evidence available for sign-off

Produced on real corpus data, reproducible by the commands shown:

| Claim | Evidence |
| --- | --- |
| Ingests a real corpus | 10,000 records, stratified across the size-ordered shards, byte-identical re-run |
| Deduplicates better than its oracle | 13 near-duplicate pairs found that byte-identical hashing, **including the corpus's own `file_sha`**, cannot see |
| Preserves provenance | 100% attribution; write-time rejection, not read-time filtering |
| Handles licences honestly | 62% of repositories carry no licence; 68.7% of skills resolve to `unknown` and are **not** redistributable |
| Reprocesses without the source | 100 records from raw with `fetch` disabled and every connector method throwing — **0 network calls** |
| Rebuilds derived indexes | index destroyed → search returns 0 → rebuilt → search works |
| Honours author removal | bytes deleted, provenance envelope and attribution survive |
