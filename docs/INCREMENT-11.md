# INCREMENT 11 — RAW STORAGE AND DERIVED INDEX REBUILD

| | |
| --- | --- |
| Document | `INCREMENT-11.md` v1.0 · Phase 04 remediation · 2026-08-27 |
| Cause | G4 attempt 1 FAIL (`.ilana/gates/G4.md` §A) |
| Goal | Close the seven absent requirements so G4 attempt 2 can be attempted honestly |

---

## 1. Current defect

The `ObjectStore` port is defined in `packages/ports/src/index.js` and **has no adapter**.
`raw_object_key` exists as a column in both store adapters and is **always null**. No byte is ever
written anywhere.

`RemovalService` already accepts an `objects` port and degrades gracefully when it is `null` — the
degradation that let the omission stay invisible through increment 10.

**`REQ-052` is absent for a different reason:** `search()` queries `canonical_skills` **directly**.
There is no derived index, so there is nothing to rebuild. `DATABASE.md` §1 store #3 specifies
*"Search index — inverted index over canonical metadata — rebuildable from #1"*, and that store does
not exist.

## 2. Requirements being closed

| Req | Statement (abbreviated) | How it closes |
| --- | --- | --- |
| `REQ-029` | Raw stored immutably, addressed by content hash, before parsing | fs adapter + hash-derived keys + immutability check at the adapter boundary |
| `REQ-030` | Raw retains bytes, source, source URL, retrieval timestamp, source version, content hash | sidecar metadata in the object store **and** a `raw_objects` table |
| `REQ-031` | Normalisation never mutates or deletes raw; RAW/PARSED/CANONICAL distinct | RAW written first; no pipeline stage may write to the object store after it |
| `REQ-032` | Reprocess stored raw **without re-contacting the source** | `reprocessFromRaw()`, proven with a connector that throws if called |
| `REQ-033` | Raw is internal processing data behind an access-control layer, never served | `RawAccess` guard + an API test asserting bytes never appear in any response |
| `REQ-034` | Retention rule from rights posture; deletable on request and on expiry; deletion tombstoned | `applyRetention()` operating on real bytes |
| `REQ-052` | Rebuild every derived index from canonical, no source contact | a real `search_index` table, dropped and rebuilt |

## 3. Existing architecture being reused — not redesigned

| Reused | Where | Unchanged |
| --- | --- | --- |
| `ObjectStore` port | `packages/ports` | method names `put/get/head/delete/exists` retained |
| Content hashing | `skill-core/identity/fingerprint.js` | `contentHash`, `partitionKey` used as-is |
| Rights and retention policy | `skill-core/rights/rights.js` | `retentionFor()` used as-is; **`DEC-019` not reinterpreted** |
| Tombstoning | `DEC-015`, `store.tombstone()` | envelope survives the bytes |
| Removal flow | `ingestion/removal.js` | already accepts an `objects` port; now given a real one |
| Re-analysis | `ingestion/reanalysis.js` | identifies affected records; now has raw to reprocess from |
| Migrations | `REQ-094` engine | v2 → v3, same mechanism |
| Provenance | `PROVENANCE.md` | `field_origins` gains raw entries; model unchanged |

## 4. Files expected to change

**New**
```
packages/ports/src/index.js                     (amended: RawAccess + ObjectStore contract assert)
packages/adapters/fs-objectstore/               local filesystem adapter
packages/adapters/memory-objectstore/           in-memory adapter, for the portability contract
packages/adapters/r2-objectstore/               R2 boundary, shape only
packages/ingestion/src/raw.js                   storeRaw, reprocessFromRaw, applyRetention
packages/ingestion/src/rebuild.js               real derived-index rebuild
```
**Amended**
```
packages/adapters/sqlite/src/schema.js          migration v3: raw_objects, search_index
packages/adapters/sqlite/src/canonical-store.js raw_objects + search_index operations
packages/adapters/memory-store/src/index.js     same operations, no SQL
apps/cli/src/appmd.mjs                          raw / retention / index rebuild commands
```
**Not touched:** `skill-core` (no I/O), the front-end (separate repository, `CR-001`).

## 5. ObjectStore contract

Existing names kept (`put/get/head/delete/exists`); `head` **is** the metadata call, so no new verb
is invented.

```
put(key, bytes, meta)  -> { key, bytes, created: bool, alreadyExisted: bool }
get(key)               -> { bytes, meta } | null
head(key)              -> meta | null
exists(key)            -> bool
delete(key)            -> bool          // true if bytes were removed
```

**Immutability at the boundary (`REQ-029`).** `put` on an existing key whose stored bytes differ
from the incoming bytes **throws**. Since the key derives from the content hash this should be
unreachable; it is enforced anyway, because "unreachable by construction" is a claim and a check is
evidence.

**Domain isolation.** No path, bucket, SDK, HTTP or `node:fs` concept crosses the port. Keys are
opaque strings the adapter interprets.

## 6. Local filesystem adapter

Key derivation, deterministic and content-addressed (`DOM-010`, `REQ-029`):

```
sha256:abcdef…  ->  <root>/sha256/ab/cd/abcdef….raw
                    <root>/sha256/ab/cd/abcdef….meta.json
```

Two-level fan-out keeps directory sizes sane; the prefix is the same `partitionKey` idea as
`NFR-033`. **Never** repository name, URL, path or any mutable attribute.

**Traversal defence (`NFR-021`).** Keys are validated against `^sha256:[0-9a-f]{64}$` before any
path is built, and the resolved absolute path is then asserted to be inside the configured root.
Two independent checks: a whitelist and a containment assertion. Source-derived strings never reach
the filesystem.

## 7. R2 adapter boundary

Same port, no SDK. Phase 1 has no paid Cloudflare plan (`DEC-010`), so this is a **boundary, not a
live integration**: it implements key derivation and validation, and its I/O methods raise a clear
"requires external infrastructure" error. It runs the shared contract suite for everything that does
not need a bucket. **Live R2 verification is not claimed.**

## 8. RAW ingestion flow

```
SOURCE ──► RAW (bytes + meta, content-addressed)
             │  raw_object_key recorded on the occurrence
             ▼
           PARSED ──► CANONICAL
```

RAW is written **before** parsing (`REQ-029`, "before any parsing"). If RAW persistence is required
and fails, the record does **not** proceed: `ingestRecord()` throws rather than producing a canonical
record that claims a raw reference it does not have.

## 9. Retention and deletion flow

Uses `retentionFor()` unchanged (`DEC-019`).

| Posture | Policy | Expiry |
| --- | --- | --- |
| `unknown` | `process-then-delete` | immediately after processing |
| known, not redistributable | `short` | 7 days |
| known, redistributable | `standard` | 90 days |

States: `retained` → `expired` → `deleted`, plus `tombstoned` from a removal request. Deletion
removes bytes; the `raw_objects` row and the tombstone envelope survive (`DEC-015`). Reprocessing a
deleted object fails explicitly with `RAW_UNAVAILABLE` and **never silently re-fetches the source**.

## 10. Re-analysis flow

`ReanalysisService` already identifies affected records. `reprocessFromRaw()` now supplies the
missing half: read bytes from the object store, parse, normalise, upsert. The proof for `REQ-032` is
a connector whose every method throws — if any source contact occurs, the test fails.

## 11. Rebuild flow

A real `search_index` table derived from canonical, and `search()` reads from it rather than from
`canonical_skills`. Rebuild: truncate, re-populate from canonical **excluding tombstoned records**,
report `{ indexed, excluded_tombstoned }`. Per `NFR-010` the report says *equivalent minus
tombstoned*, never *identical*. Deterministic: the same canonical state produces the same index.

## 12. Security and access control

`REQ-033`: raw is internal processing data. A `RawAccess` guard names the permitted internal
purposes (`reprocess`, `retention`, `removal`, `verify`); anything else is refused. The API has no
route to raw and a test asserts raw bytes appear in no response.

Also verified: no secret in source (`NFR-019`/`NFR-020`), corpus and raw roots gitignored, keys
validated before use, no source-derived value interpolated into SQL (`DEF-004`'s rule).

## 13. Failure modes

| Failure | Response |
| --- | --- |
| Object store unavailable at write | `ingestRecord()` throws; no canonical record is created |
| Key fails validation | Refused before any path is built |
| Resolved path escapes root | Refused |
| `put` with differing bytes on an existing key | Throws — immutability violation |
| `get` on a deleted object | `null`; reprocessing raises `RAW_UNAVAILABLE` |
| Reprocess with source unavailable | Succeeds from raw; that is the point |
| Rebuild while records are tombstoned | Excluded and **counted** in the report |

## 14. Testing strategy

`TC-208`+. Contract suite over **three** ObjectStore adapters (fs, memory, r2-boundary), mirroring
the `DEC-027` proof that a SQL store and a plain-map store agree.

The `REQ-032` test is the centrepiece and must not be faked: raw is read from a **real** object
store on disk, and the connector throws on any method call.

## 15. Exit criteria

1. Raw bytes genuinely on disk, retrievable, byte-identical.
2. Immutability enforced at the adapter boundary, tested.
3. `raw_object_key` populated on real records.
4. Source, URL, timestamp, version, hash preserved.
5. Traversal and key validation tested against real attack strings.
6. Retention deletes real bytes; state observable.
7. Removal deletes real bytes; envelope survives.
8. Re-analysis works with the source unavailable — **proven, not mocked**.
9. Rebuild actually rebuilds and reports exclusions.
10. Three adapters pass one contract suite.
11. Dependency lint clean; no new dependencies.
12. All 220 existing tests still pass.
13. Traceability updated with `DES`/`TC` for all seven requirements.
