# INGESTION PIPELINE

| | |
| --- | --- |
| Document | `INGESTION.md` v1.0 · Phase 02 · `[architect]` · 2026-08-27 |
| Satisfies | `REQ-009`–`REQ-034`, `REQ-095`, `REQ-098`, `NFR-007`–`NFR-009` |

---

## 1. State machine

```
                    ┌──────────┐
   discover ──────► │DISCOVERED│
                    └────┬─────┘
                         ▼
                    ┌─────────┐  content already known by hash?
                    │ FETCHED │───────────yes──────────┐
                    └────┬────┘                        │
                         ▼                             │
                    ┌────────┐   parse fail            │
                    │ PARSED │──────────► PARSE_FAILED │  (terminal, recorded, NOT retried)
                    └────┬───┘                         │
                         ▼                             │
                   ┌────────────┐                      │
                   │ NORMALISED │                      │
                   └─────┬──────┘                      │
                         ▼                             │
                  ┌──────────────┐                     │
                  │ FINGERPRINTED│◄────────────────────┘
                  └──────┬───────┘
                         ▼
                  ┌────────────┐
                  │ DEDUPLICATED│ → resolves to CanonicalSkill
                  └──────┬──────┘
                         ▼
                    ┌────────┐
                    │ STORED │  ← canonical write, provenance, rights
                    └────┬───┘
                         ▼
                  ┌──────────────┐
                  │ RETENTION_SET│  ← REQ-098 rights-aware TTL on raw bytes
                  └──────────────┘

  any stage ──retries exhausted──► DEAD_LETTER  (inspectable, resubmittable)
```

**Every transition is:** retryable, idempotent, observable, independently configurable
(`REQ-015`–`REQ-022`).

**`PARSE_FAILED` is terminal and is not a dead letter.** A malformed `SKILL.md` is *data*, not a
system failure — retrying it produces the identical failure forever and would bill a Queue
operation each time (`DATABASE.md` §4.1 finding 4). It is recorded with its reason (`REQ-037`) and
counted (`REQ-082`). Confusing bad input with system failure is how DLQs fill with noise and stop
being read.

## 2. Idempotency (`REQ-016`, `NFR-009`)

At-least-once delivery is **verified**, not assumed (`DEC-025`) — Cloudflare states messages
*"may be delivered more than once"* and prescribes a unique id as primary/idempotency key. That is
exactly `DOM-001`.

| Stage | Deterministic key | Repeat behaviour |
| --- | --- | --- |
| Discover | `(source, repo_full_name, path)` | upsert |
| Fetch | `content_hash` | skip if object exists |
| Parse | `content_hash` | overwrite — pure function of content |
| Normalise | `content_hash` + normaliser version | overwrite |
| Fingerprint | `content_hash` | pure |
| Dedup | `content_hash` → canonical id | resolve, never create a second |
| Store | `(source, repo_full_name, path, content_hash)` (`DOM-001`) | upsert |

Every stage from Parse onward is a **pure function of content plus a version tag**. That is what
makes `REQ-032` (reprocess without source contact) and `REQ-095` (re-analysis) work at all.

## 3. Resumability (`REQ-010`, `NFR-008`)

Discovery cursors persist in canonical (never in the queue — queue state is transient,
`DATABASE.md` §1). After `SIGKILL`: re-read cursor, re-emit only uncompleted work, rely on
idempotent upserts for anything in flight. **No duplicate canonical records, no lost jobs.**

`NFR-007` is tested by injecting failure at row *n* of 10,000 and asserting rows 1..*n*−1 are
untouched — byte-identical, not merely "present".

## 4. Batch ladder (`REQ-012`)

100 → 1,000 → 10,000, **stratified across the corpus offset range** (`DEC-024`). Each rung must
satisfy `NFR-001` (byte-identical re-run) before the next is attempted. Scale is earned, not assumed.

## 5. Retention (`REQ-098`, `DEC-019`)

```
rights.state == "unknown"          → shortest TTL, bytes deleted after processing
rights.redistributable == false    → short TTL
rights.redistributable == true     → standard TTL, still not permanent by default
```

On expiry: bytes deleted, **provenance envelope and tombstone survive permanently** (`DEC-015`).

**Accepted consequence:** `REQ-032` weakens for expired records — they need re-fetch. Correct
trade. The alternative is holding content we have no clear right to hold, to save a network call.

## 6. Re-analysis (`REQ-095`)

Every derived value records `(analyser_id, analyser_version)`. On a version, rule, model or
security-rule change: query affected records, enqueue reprocessing **from stored raw or from
canonical** — never from the source (`REQ-032`), unless bytes have expired under §5.

"Which records are affected?" is therefore a **query**, not a guess. That is the whole reason the
version tag is stored beside the value rather than in a changelog.

## 7. Failure modes

| Failure | Detection | Response |
| --- | --- | --- |
| Malformed `SKILL.md` | parser | `PARSE_FAILED`, recorded, **not** retried |
| Oversized / YAML bomb | parser guards (`NFR-022`) | clean fail with reason |
| Source 429 | HTTP | honour `Retry-After`, backoff+jitter |
| Source down | consecutive failures | circuit breaker (`REQ-025`, S) |
| Content changed mid-run | hash mismatch | new occurrence, new version (`REQ-055`) |
| Queue redelivery | at-least-once | idempotent upsert absorbs it |
| Missing DLQ config | startup check | **refuse to start** — silent deletion otherwise (`DEC-025`) |
