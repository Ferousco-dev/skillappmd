# TEST STRATEGY

| | |
| --- | --- |
| Document | `TEST_STRATEGY.md` v1.0 · Phase 02 · `[verifier]` · 2026-08-27 |
| Satisfies | BRIEF §61, Constitution Article 3 (every requirement → ≥1 test case) |
| Gates | G4 |

---

## 1. Levels

| Level | Scope | Network | Count (planned) |
| --- | --- | --- | --- |
| Unit | pure functions in `skill-core` | **none** (`NFR-030`) | ~60 |
| Integration | stage + adapter | none (local adapters) | ~30 |
| System | full pipeline over a fixture corpus | none | ~12 |
| Acceptance | the ladder: 100 → 1,000 → 10,000 | local corpus only | 3 |
| Contract | each adapter pair against one suite | none | ~20 |

**Everything runs without network.** Connectors are tested against recorded fixtures; live source
calls are a separate, manually-invoked suite, so CI never depends on a third party's uptime and
never consumes anyone's rate limit.

## 2. The two oracles

The corpus supplies **row-level ground truth**. This is unusual and it is the strongest asset the
test strategy has: most projects validate against fixtures the author invented.

| Oracle | Column | Validates | Target |
| --- | --- | --- | --- |
| Deduplication | `dedup_primary` | `REQ-044`, `REQ-047` | ≥99.9% agreement (quality target, `DEC-023`); **0 unexplained** |
| Parser | `frontmatter_valid` | `REQ-038`, `REQ-041` | ≥99% (`NFR-003`); every disagreement triaged |

**Measured baseline (R3):** `dedup_primary` = 50.2% on stratified sampling vs the paper's 50.5%
verbatim. The oracle behaves as documented across the corpus.

**All oracle sampling is stratified across the offset range** (`DEC-024`). R3 showed shards ordered
by file size — head sampling would validate against ~10-byte files and pass while proving nothing.
*A test that passes against unrepresentative data is worse than no test: it produces confidence.*

## 3. Test cases by area (BRIEF §61)

| Area | Cases |
| --- | --- |
| **Ingestion** | duplicate discovery is idempotent · fetch failure → retry → DLQ · rate limit honoured · malformed skill → `PARSE_FAILED` not DLQ · `SIGKILL` mid-run → resume, no duplicates (`NFR-008`) · failure at row *n* leaves 1..*n*−1 byte-identical (`NFR-007`) |
| **Parsing** | valid `SKILL.md` · missing frontmatter · malformed YAML · **unknown keys preserved** (`REQ-036`) · name >64 chars · description >1024 · reserved words · empty file · invalid UTF-8 · 100 MB file · YAML bomb (`NFR-022`) |
| **Deduplication** | exact duplicate · CRLF/LF variant → `NEAR_DUPLICATE` · same name different content → **NOT duplicate** (`REQ-045`) · fork with identical content → both `EXACT_DUPLICATE` and `FORK` · occurrence retrievable after collapse (`REQ-046`) |
| **Provenance** | attribution missing → **write rejected** (`NFR-004`) · every field classifiable (`NFR-005`) · inference without producer/version → rejected · source conflict → both retained |
| **Licensing** | L2 present → known · L2 absent, L3 present → **unknown** · L2/L3 conflict → most restrictive + flagged · unparseable → unknown · `redistributable=true` without L2 → **impossible** (`NFR-006`) · unknown is an explicit state on the wire (`DEC-018`) |
| **Rights/retention** | unknown → shortest TTL · expiry deletes bytes, envelope survives (`DEC-015`) · removal request tombstones |
| **Security** | YAML bomb · oversized · path traversal in `path` · **no execution path exists** (`REQ-080`) · secrets absent from logs and API output (`NFR-019`) · bare score not representable (`SECURITY.md` §4 cond. 1) |
| **API** | attribution always present · content never served (`REQ-062`) · cursor pagination on every collection (`NFR-039`) · no offset pagination anywhere · 429 + `Retry-After` · p95 ≤200 ms at 10k (`NFR-012`) |
| **Recovery** | drop all derived indexes → rebuild → equivalent (`NFR-010`) · backup → restore → verify count + digest (`NFR-035`) · rebuild after tombstoning reports the tombstoned count |
| **Idempotency** | every stage executed 10× ≡ once (`NFR-009`) · full re-run byte-identical (`NFR-001`) |

## 4. Contract tests — the portability proof

One suite, run against **every adapter pair**:

```
CanonicalStore:  sqlite | d1 | postgres
ObjectStore:     fs | r2
Queue:           local-queue | cf-queue
```

**The local queue deliberately reproduces at-least-once, including duplicate delivery.** A local
queue that never duplicates lets non-idempotent code pass locally and fail in production — exactly
the bug class `NFR-027` exists to prevent. Testing against the easier adapter is not testing.

**G4 criterion (`DEC-027`):** the Postgres adapter can be written and the full suite pass **without
editing one line in `skill-core/` or `ingestion/`.** If that fails, `DEC-027`'s migration path is
fiction and `DATABASE.md` §8 has not held.

## 5. What is deliberately not tested

| Not tested | Why |
| --- | --- |
| Live source calls in CI | Consumes others' rate limits; makes CI depend on third-party uptime |
| `NFR-011` (30 min/10k) | **Provisional target, not acceptance criterion** (`DEC-017`). Benchmarked, not asserted |
| Cloudflare adapters in CI | Requires paid account (`DEC-010`). Contract suite runs against them manually before deploy |
| AI/embedding paths | Do not exist (`NFR-015`) |

## 6. Defects

`DEF-###` in `.ilana/defects.md`: description, severity, requirement, reproduction, status.
An oracle disagreement is **not automatically a defect** — it may be a documented policy difference
(`DEC-023`). It becomes a defect when it is **unexplained**.
