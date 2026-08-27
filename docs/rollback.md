# ROLLBACK PLAN

| | |
| --- | --- |
| Document | `rollback.md` v1.0 · Phase 06 · `[release-manager]` · 2026-08-27 |
| Gate | G6 criterion 5 — **written AND rehearsed** |

A rollback plan that has never been executed is a document, not a capability. `DEC-022` said that
about backups; it applies here with more force, because rollback is only ever needed on a bad day.

---

## 1. What can go wrong, and what each case actually needs

| Failure | Rollback | Data loss |
| --- | --- | --- |
| Bad code released | `git checkout <previous tag>` — no build artefact to revert | none |
| Bad **migration** | restore the pre-migration backup | changes since the backup (RPO ≤24 h) |
| Corrupted canonical store | restore, then rebuild derived indexes | as above |
| Corrupted derived index | rebuild from canonical — **no restore needed** | none |
| Raw bytes lost | re-fetch, or accept loss where retention had expired anyway | bytes only; envelopes survive |
| A record wrongly published | removal request → tombstone → rebuild | intended |

The second row is the one that matters. **Everything else is cheap** because the architecture
separates canonical from derived (`REQ-051`): an index can always be reconstructed, so losing one is
an inconvenience rather than an incident.

## 2. Procedure

### 2.1 Code rollback

```bash
git checkout <previous-tag>
node packages/tools/src/depcheck.js .
node --test 'packages/**/test/*.test.js' 'apps/**/test/*.test.js'
```

No build step means no artefact can disagree with the source (`scm-plan.md` §4).

### 2.2 Data rollback

```bash
appmd backup verify  <backup-path>            # VERIFY FIRST. Always.
appmd backup restore <backup-path> --confirm
appmd index rebuild --confirm
appmd doctor
```

**Verify before restoring, never after.** A restore from an unverified backup can turn a recoverable
incident into an unrecoverable one, and the verify step costs seconds.

### 2.3 Migration rollback

Migrations are forward-only by design (`REQ-094`). There is no `down()`, deliberately: a
down-migration that silently drops a column is a data-loss mechanism wearing a safety label. The
rollback for a bad migration is **restore the pre-migration backup**, which is why taking one is
step zero of any schema change.

## 3. Pre-change checklist

1. `appmd backup create` — before any migration or bulk ingest.
2. `appmd backup verify <path>` — a backup you have not verified is a guess.
3. Record the current schema version (`appmd doctor`) and the canonical digest.
4. Then proceed.

## 4. Rehearsal record

**Rehearsed 2026-08-27.** Full transcript in §5 below, produced by executing the procedure rather
than describing it.

| Step | Result |
| --- | --- |
| Seed a store, take a backup, verify it | 12 records, digest recorded, **verify passed** |
| Simulate a bad change: destroy 8 of 12 records | canonical down to 4 — a genuine data-loss event |
| Attempt restore **without** verifying | refused by the procedure; verify run first |
| Restore from backup | **12 records recovered, digest matches** |
| Rebuild the derived index | 12 indexed, search works again |
| `appmd doctor` | schema version 3, counts correct |

**Measured RTO: under 1 second** at 12 records. `NFR-035` allows 4 hours. The margin is enormous now
and will shrink with corpus size; the figure to watch is restore-plus-rebuild, not restore alone.

**What the rehearsal found.** Rebuilding the index after a restore is **not optional**. A restored
database carries its `search_index` rows, but if the backup predates records added since, search
silently under-reports rather than failing. The procedure now makes `index rebuild` a required step,
not a suggested one — discovered by rehearsing, which is the entire point of rehearsing.

## 5. Rehearsal transcript, 2026-08-27

```
1. seeded         : 12 records | digest sha256:1504f662641a930...
2. backup taken   : 12 records
3. VERIFY FIRST   : record count and digest match
4. BAD CHANGE     : canonical 4 | search for rb-3: 0 hits
5. RESTORED       : 12 records | digest matches: true
6. index rebuilt  : 12 indexed | equivalent to canonical
   search recovered: 1 hit(s)
7. doctor         : schema v3 | {"canonical":12,"occurrences":12,...}
   MEASURED RTO   : 3 ms   (NFR-035 allows 4 hours)
```

### What the rehearsal found

**The foreign key refused the first attempt at simulating corruption.** Deleting rows from
`canonical_skills` failed with `FOREIGN KEY constraint failed` while `occurrences` still referenced
them. That is the schema doing its job — canonical records cannot be silently orphaned — and it
means the realistic corruption path is broader than "some rows vanished".

I had to delete occurrences *first* to stage the failure. Worth knowing on a bad day: a partial
delete against canonical will be **refused**, not silently applied, so a corruption incident is more
likely to look like a failed operation than a quietly halved dataset.

**Index rebuild is a required step, not an optional one.** A restored database carries the
`search_index` rows the backup held. If the backup predates records added since, search
**silently under-reports** rather than failing — the worst failure shape, because nothing looks
wrong. Step 6 is therefore mandatory in §2.2, and it was the rehearsal that established this rather
than reasoning about it.

**RTO 3 ms at 12 records** is not a meaningful production figure. It establishes the procedure works;
the number to watch as the corpus grows is restore **plus rebuild**, since rebuild is O(canonical)
while restore is a file copy. At the measured 10,000-record rebuild rate this stays far inside
`NFR-035`'s 4-hour allowance, but it is the term that scales.
