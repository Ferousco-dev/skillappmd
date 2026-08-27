# OBSERVABILITY

| | |
| --- | --- |
| Document | `OBSERVABILITY.md` v1.0 · Phase 02 · `[architect]` · 2026-08-27 |
| Satisfies | `REQ-013`, `REQ-082`–`REQ-087`, `NFR-019` |

---

## 1. Counters (`REQ-082`)

`discovered` · `fetched` · `fetch_failed` · `parsed` · `parse_failed` · `duplicated` ·
`canonical_created` · `stored` · `dead_lettered` · `retention_expired` · `rights_unknown`

Per source, per stage, per run. `rights_unknown` earns its place: it is the direct measure of how
much of the corpus we cannot make claims about, and it is the number that decides whether the
licence model is working or merely present.

## 2. Job lifecycle (`REQ-084`)

Queryable by `job_id` **and** by `skill_ref`. The operator's real question is *"what happened to
this skill?"*, not *"what happened to job 4c1f?"* — an observability surface that only answers the
second is an audit log, not a diagnostic tool.

## 3. Pipeline health (`REQ-083`)

Queue depth per stage · latency p50/p95 per stage · error rate per source · retry rate ·
DLQ depth · circuit-breaker state.

**Retry rate is a cost metric as well as a health metric** — retries and DLQ writes are billable
Queue operations (`DEC-025`). A retry storm shows up on the invoice.

## 4. The run report (`REQ-085`)

Every ingestion run emits a report stating counts, failures, **and any sampling bias or truncation
applied**.

This is not paperwork. R3 measured the corpus shards to be **ordered by file size** — offset 0
yields ~10-byte files, offset 3.4M yields ~19 KB. A run over head-of-shard data would produce
"mean skill size: 10 bytes", *technically emitted by the pipeline* and completely false.

The report therefore states: sampling method, offset range, shards touched, and whether the sample
is stratified (`DEC-024`). **A number without its sampling method is not a measurement.**

## 5. Logging (`NFR-019`, `REQ-086`)

Structured JSON, UTC RFC 3339 (`NFR-038`), correlation by `job_id` and `skill_ref`.

**Never logged:** secrets, credentials, tokens, full raw content, personal fields beyond the public
handle. Enforced by assertion tests over log output, not by reviewer vigilance — a CI secret-scan
catches committed secrets; only output assertions catch leaked ones.

## 6. Deliberately absent in Phase 1

| Not built | Why |
| --- | --- |
| Dashboards | BRIEF §4 — CLI-queryable counters suffice for one operator |
| Distributed tracing | One process, two runtimes. `job_id` correlation is enough |
| Alerting | Nothing is on-call. Runs are operator-initiated |
| AI cost accounting (`REQ-087`) | `NFR-015` — zero AI spend in Phase 1. Counter shape reserved |

`DEC-021`: the counters are designed so a dashboard *could* read them. None is built.
