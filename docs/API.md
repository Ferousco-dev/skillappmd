# API

| | |
| --- | --- |
| Document | `API.md` v1.0 · Phase 02 · `[architect]` · 2026-08-27 |
| Satisfies | `REQ-064`–`REQ-074`, `REQ-093`, `REQ-097`, `NFR-012`, `NFR-032`, `NFR-039` |

---

## 1. Surface (Phase 1, read-only)

| Method | Path | Req |
| --- | --- | --- |
| GET | `/api/v1/skills/:id` | `REQ-065` |
| GET | `/api/v1/skills` | `REQ-066` |
| GET | `/api/v1/skills/:id/occurrences` | `REQ-067` |
| GET | `/api/v1/sources/:id` | `REQ-068` |
| GET | `/api/v1/search?q=` | `REQ-069` |

**No writes.** Ingestion is CLI/batch (`REQ-088`). An HTTP write surface is scope Phase 1 does not
need and would have to be secured, rate-limited and audited.

## 2. Response envelope

```jsonc
{ "data": { ... },
  "meta": { "request_id": "...", "generated_at": "2026-08-27T13:45:00Z" },
  "cursor": { "next": "opaque-or-null", "limit": 50 },
  "attribution": { "repository": "owner/repo", "owner": "owner",
                   "canonical_source_url": "https://github.com/..." },
  "notice": "Skills are indexed from public repositories. Each is subject to its own
             repository licence. AppMD does not certify or verify any skill." }
```

`attribution` is **not optional** (`REQ-061`, `NFR-004`). The serializer cannot emit a record
without it, because the record could not have been written without it.

## 3. Facts vs inferences on the wire (`REQ-070`)

```jsonc
"declared":  { "name": "foo", "description": "..." },       // source facts
"inferred":  { },                                            // empty in Phase 1
"rights":    { "state": "unknown", "redistributable": false, "basis": "..." }
```

Structural, not prose. A consumer cannot read an inference as a fact by accident.
`rights.state: "unknown"` is on the wire (`DEC-018`) — clients see "we don't know" as distinct
from "we know you may not".

## 4. Pagination (`NFR-039`)

**Every collection whose size is not provably bounded is cursor-paginated with an enforced maximum
page size.** Structural rule: an endpoint returning an unbounded collection cannot be added.

Cursors are opaque, encoding `(sort_key, id)`. **No offset pagination** (`NFR-032`) — it is
incorrect under concurrent writes and degrades linearly at depth.

`/skills/:id/occurrences` is paginated because a widely-copied skill has many occurrences —
measured duplicate share is ~49.8% (R3), and popular skills sit far above the mean.

## 5. What the API never emits (`REQ-071`, `REQ-062`, `REQ-093`)

| Never | Why |
| --- | --- |
| Third-party skill **content** | `REQ-062`, `DEC-009` — Phase 1, regardless of licence |
| Secrets, credentials, tokens | `NFR-019` |
| Internal storage keys | Leaks the object layout |
| Raw records | `REQ-033` — internal processing data |
| Individual-author fields beyond attribution | `REQ-093`, `DEC-020` |
| A bare trust score | `SECURITY.md` §4 cond. 1 — not representable |

## 6. Rate limiting (`REQ-097`)

Port interface; Phase 1 has **one** implementation: in-process, configurable request budget per
client identifier over a configurable window, **HTTP 429 + `Retry-After`** on breach.

Distributed/shared-state limiting is future work (`DEC-021`). We ask sources to respect our
identity and limits (`NFR-023`); returning a well-formed 429 is the same courtesy outward.

## 7. Errors

```jsonc
{ "error": { "code": "SKILL_NOT_FOUND", "message": "...", "request_id": "..." } }
```

Stable machine-readable codes. `404` not-found · `400` invalid cursor/params · `429` rate limited
(+`Retry-After`) · `500` internal (**never** leaking internals). Messages are for humans; codes are
the contract.

## 8. Performance (`NFR-012`)

≤200 ms p95 for `GET /skills/:id` at 10,000 skills, measured locally. The hot read is one canonical
row plus provenance and rights — **one row** under `DEC-026`'s JSON provenance, rather than a
four-table join. That is a second, unplanned benefit of the storage decision.

## 9. Versioning and future surface

`/api/v1/` from the first commit (`REQ-064`). Additive changes only within a version; breaking
changes get `/v2`.

Future (`REQ-072`–`REQ-074`): CLI consumes this same surface; then MCP tools; then semantic search,
capability, graph, resolution, composition. **All read-side over a correct index** — none requires
changing the endpoints above, which is the test that Phase 1's API shape does not foreclose them.
