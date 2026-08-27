# QUEUE AND JOB MODEL

| | |
| --- | --- |
| Document | `QUEUE_MODEL.md` v1.0 · Phase 02 · `[architect]` · 2026-08-27 |
| Satisfies | `REQ-015`–`REQ-023`, `REQ-084`, `NFR-009` |
| Evidence | `DEC-025` (verified), `DATABASE.md` §4 (computed cost) |

---

## 1. Verified platform facts (`DEC-025`)

| Fact | Value |
| --- | --- |
| Delivery | **At-least-once.** *"may be delivered more than once"* |
| Ordering | **UNVERIFIED** → no stage may assume it |
| DLQ | Native: `dead_letter_queue = "name"` |
| Default retries | 3 |
| **No DLQ configured** | *"messages that reach the retry limit are deleted permanently"* |
| DLQ retention (no consumer) | 4 days |
| Message size | 128 KB |
| Throughput | 5,000 msg/s per queue |
| Billing | $0.40/M ops, **one op per 64 KB written, read or deleted**; retries and DLQ writes count |

## 2. Job record (`REQ-017`)

```jsonc
{ "job_id": "...", "skill_ref": "gitskills:owner/repo:path", "source": "gitskills",
  "stage": "PARSED", "attempt": 1, "status": "succeeded",
  "started_at": "2026-08-27T13:45:00Z", "completed_at": "...", "error": null,
  "content_hash": "sha256:..." }
```

Queryable by `job_id` **and** by `skill_ref` (`REQ-084`) — the second matters more in practice,
because the operator's real question is "what happened to *this skill*", not "what happened to
job 4c1f".

## 3. Messages carry references, never content (`REQ-018`, `DEC-005`)

Measured corpus mean body is 4,425 B (R3) — comfortably under 128 KB. **The rule still holds**, for
three reasons: p99 is 20.7 KB and the tail is unbounded across future sources; billing counts
**per 64 KB**, so payloads directly multiply cost; and a reference-carrying message stays replayable
after the content store changes.

## 4. Cost, and the collapse question

Computed (`DATABASE.md` §4):

| Occurrences | 9 messages/occ | 4 messages/occ | Saved |
| ---: | ---: | ---: | ---: |
| 1M | $3.20 | $1.20 | $2.00 |
| 10M | $35.60 | $15.60 | $20.00 |
| 100M | $359.60 | $159.60 | **$200.00** |

Parse → normalise → fingerprint → dedup are **deterministic pure functions of the same content**.
They share a failure mode, and an independent retry of one is meaningless: if parse succeeded,
fingerprint will too. Collapsing them into one message is defensible.

**Phase 1 keeps 9 stages anyway.** At 10k occurrences the saving is **$0.00**, and per-stage
observability (`REQ-082`, `REQ-083`) is worth more than nothing. `DEC-021`: the optimisation is
*designed* — stage boundaries are internal function calls, so collapsing is a composition change,
not a rewrite — and **not built**.

**Trigger to collapse:** when queue operations exceed $50/month, or ingestion runs exceed 10M
occurrences. Written down so it is a decision, not a discovery.

## 5. Retry, DLQ, poison messages

Exponential backoff with jitter (`REQ-019`), bounded attempts, then DLQ (`REQ-020`).

**The queue port refuses to initialise a consumer without a DLQ.** Cloudflare's documented default
is permanent deletion, so a configuration omission would cause silent data loss. Startup failure
is the correct response to that; a warning in a log nobody reads is not.

DLQ entries are listable, inspectable and resubmittable (`REQ-021`). **`PARSE_FAILED` never enters
the DLQ** — bad input is data, not failure (`INGESTION.md` §1).

Retries are billable. `REQ-019`'s bound and `REQ-025`'s breaker are **cost controls** as much as
reliability controls.

## 6. Port and adapters (`REQ-023`)

```
Queue port:  send(msg) · sendBatch(msgs) · consume(handler, {batchSize, maxRetries, dlq})
             deadLetters(cursor) · resubmit(id)
```

| Adapter | Backing | Delivery | DLQ |
| --- | --- | --- | --- |
| `local-queue` | SQLite table | at-least-once (deliberately matched) | table |
| `cf-queue` | Cloudflare Queues | at-least-once (native) | native |

**The local adapter deliberately reproduces at-least-once, including occasional duplicate
delivery in tests.** A local queue that never duplicates would let non-idempotent code pass
locally and fail in production — which is precisely the class of bug `NFR-027`'s two-adapter rule
exists to prevent. Testing against the *easier* of two adapters is not testing.
