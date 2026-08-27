/**
 * Derived-index rebuild. DES-057. REQ-051, REQ-052, NFR-010.
 *
 * G4 attempt 1 recorded that `rebuildReport()` counted records and called that a
 * rebuild. This is the actual flow:
 *
 *   CANONICAL (source of truth)  ->  rebuild  ->  search_index (derived, disposable)
 *
 * No source contact. Nothing here knows a connector exists.
 */

/**
 * REQ-052: destroys the derived index and rebuilds it from canonical alone.
 *
 * NFR-010: tombstoned records are EXCLUDED and COUNTED. The report never claims
 * equivalence when records were deliberately left out - "equivalent minus tombstoned"
 * is the honest phrase and it is in the returned object, not only in prose.
 */
export function rebuildSearchIndex({ store, now, batchSize = 500 }) {
  if (typeof now !== 'string') throw new TypeError('rebuildSearchIndex requires a UTC timestamp (NFR-038)');

  const dropped = store.clearSearchIndex();

  let indexed = 0, excludedTombstoned = 0, scanned = 0;
  let cursor = null;
  do {
    const page = store.canonicalForIndexing({ cursor, limit: batchSize });
    for (const row of page.rows) {
      scanned++;
      if (row.tombstoned_at) { excludedTombstoned++; continue; }
      store.indexCanonical({
        canonicalId: row.id,
        // Metadata only. Raw content is never indexed (REQ-033, REQ-062).
        haystack: `${row.declared_name ?? ''} ${row.declared_description ?? ''}`.toLowerCase().trim(),
        declaredName: row.declared_name,
        createdAt: row.created_at,
        now,
      });
      indexed++;
    }
    cursor = page.cursor.next;
  } while (cursor);

  return {
    dropped, scanned, indexed, excludedTombstoned,
    equivalence: excludedTombstoned === 0
      ? 'equivalent to canonical'
      : `equivalent to canonical MINUS ${excludedTombstoned} tombstoned record(s)`,
    rebuiltAt: now,
    sourceContact: false,
  };
}
