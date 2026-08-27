# DEDUPLICATION AND IDENTITY

| | |
| --- | --- |
| Document | `DEDUPLICATION.md` v1.0 · Phase 02 · `[architect]` · 2026-08-27 |
| Satisfies | `DOM-001`–`DOM-005`, `REQ-042`–`REQ-049`, `NFR-002` |
| Evidence | R2 (schema), R3 (measured 50.2% primary share) |

---

## 1. Identity model

An **occurrence** is an observation. A **canonical skill** is an identity. Many occurrences → one
canonical skill (`DOM-001`, `DOM-002`).

Canonical identity derives from **origin repository coordinates + content** (`DOM-003`, `DEC-014`),
never from an aggregator's id. Practical consequence: if SkillsMP terminated access tomorrow —
which its ToS permits without notice (`RSK-003`) — **zero canonical identities would be
invalidated.** Identity that depends on a third party you do not control is not identity.

## 2. Fingerprints (`REQ-042`, `REQ-043`, `DEC-012`)

| Fingerprint | Definition | Catches |
| --- | --- | --- |
| `content_hash` | SHA-256 over raw bytes | byte-identical |
| `normalised_hash` | SHA-256 over normalised text: line endings → `\n`, trailing whitespace stripped, frontmatter keys sorted, final newline enforced | trivial variants |
| `semantic_fingerprint` | — | **future** (`REQ-049`) |

**GitSkills `file_sha` is not used as identity.** It is a git blob SHA — whitespace- and
line-ending-sensitive, and computed over `"blob <len>\0" + bytes`. It answers "byte-identical?"
and nothing else. Retained as a **source fact** for cross-checking (`DEC-012`).

The two-tier design matters because CRLF/LF differences are pervasive across a corpus mined from
282,200 repositories. `content_hash` alone would report those as distinct skills, inflating the
canonical count with pure noise.

## 3. Resolution

```
occurrence
   ├─ content_hash matches existing?      → EXACT_DUPLICATE  → resolve to canonical
   ├─ normalised_hash matches existing?   → NEAR_DUPLICATE(trivial) → resolve, flag variance
   └─ neither                              → new CanonicalSkill
```

Relationship vocabulary is closed (`DOM-005`): `EXACT_DUPLICATE`, `NEAR_DUPLICATE`, `FORK`,
`MIRROR`, `VERSION`, `RELATED`, `ALTERNATIVE`, `UNRELATED`.

**Name equality is never evidence** (`REQ-045`, BRIEF §13). The spec permits any repository to
declare `name: pdf`; the corpus contains thousands. Name-based dedup would merge unrelated skills
and produce confident nonsense.

`FORK` / `MIRROR` (`REQ-048`, S) use `repos.is_fork` as a **signal distinct from content equality** —
a fork with identical content is `EXACT_DUPLICATE` *and* `FORK`, and those are different facts
serving different questions (dedup vs lineage, BRIEF §14).

## 4. Evidence survives collapse (`REQ-046`)

Deduplication collapses **identity**, never **evidence**. Every occurrence stays individually
retrievable with its repository and path.

This is what makes attribution possible at all: a canonical skill with 47 occurrences has 47
repositories that must each be credited, and `GET /skills/:id/occurrences` (cursor-paginated,
`REQ-067`) is how a consumer sees them.

## 5. Validation against the oracle (`REQ-047`, `NFR-002`)

`artifacts.dedup_primary` is a **row-level verdict** — not merely the paper's aggregate figure.

**Measured corroboration (R3):** stratified sampling gives `dedup_primary` = **50.2%**; the paper
reports **50.5%** verbatim copies. Independent measurement lands within 0.3 points, so the oracle
behaves as documented across the corpus and per-row precision/recall is sound.

| Metric | Target |
| --- | --- |
| Agreement on exact-content grouping | ≥99.9% (**quality target**, `DEC-023`) |
| Unexplained disagreement | **0 — this is the gate** |

Expected legitimate divergence: their grouping is exact-content; ours adds a normalisation tier, so
AppMD will merge CRLF/LF pairs they separate. **That is our design working, not a defect** — and it
must be reported as a difference with its reason, never reconciled away to make a number look clean.

**`DEC-023`: explanation binds, agreement does not.** Someone else's policy choices must not be
able to fail our build; unexplained behaviour must.

**Sampling must be stratified** (`DEC-024`). R3 showed shards ordered by file size — head sampling
would validate dedup against ~10-byte files and pass while proving nothing.

## 6. Scaling

The dedup lookup — `SELECT canonical_id WHERE content_hash = ?` — runs **once per occurrence**,
3.8M times per full corpus pass. It is the hottest read on the write path.

| Scale | Behaviour |
| --- | --- |
| ≤10M | Unique index probe. Fine on SQLite/D1/Postgres |
| ~100M | Index size dominates; partition by `content_hash` prefix (`NFR-033`) |
| 1B | Partitioned index; hash prefix is already the natural shard key |

`NFR-033` is satisfied by construction: `content_hash` is uniformly distributed, so prefix
partitioning needs **no schema change** — only a routing layer, added when it is needed and not before.

## 7. Failure modes

| Failure | Response |
| --- | --- |
| Hash collision | SHA-256; treated as impossible. Would surface as a content mismatch on read |
| Same content, conflicting metadata | Both occurrences retained; canonical picks a representative and records why |
| Oracle disagreement | Recorded, explained, reported. Never silently reconciled |
| Content changes at source | New `content_hash` ⇒ new occurrence + new version (`REQ-055`), predecessor preserved |
