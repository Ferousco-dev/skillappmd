/**
 * Re-analysis. DES-056. REQ-095, NFR-017, REQ-032.
 *
 * BRIEF SS10: "if our AI model improves six months later, we should be able to
 * reprocess old raw data without crawling the source again." That sentence is only
 * true if "which records are affected?" is a QUERY. It is, because every derived
 * value carries the analyser id and version that produced it.
 */
export const REANALYSIS_TRIGGER = Object.freeze({
  ANALYSER_VERSION: 'analyser_version',
  RULES: 'analysis_rules',
  MODEL: 'model',
  SECURITY_RULES: 'security_rules',
});

export class ReanalysisService {
  #store; #queue; #clock;

  constructor({ store, queue = null, clock }) {
    if (!store || typeof clock !== 'function') {
      throw new TypeError('ReanalysisService requires a CanonicalStore port and a clock (NFR-038)');
    }
    this.#store = store; this.#queue = queue; this.#clock = clock;
  }

  /** Records which analyser at which version produced the current derived values. */
  async stamp(canonicalId, versions) {
    await this.#store.setAnalyserVersions(canonicalId, versions, this.#clock());
  }

  /**
   * Identifies affected records without enqueuing anything. `--dry-run` exists so an
   * operator can see the blast radius before paying for it (UI-002 tolerance).
   */
  async plan({ analyser, version, limit = 1000 }) {
    const affected = [];
    let cursor = null;
    do {
      const page = await this.#store.findForReanalysis({ analyser, version, cursor, limit: 500 });
      affected.push(...page.rows.map((r) => ({ id: r.id, contentHash: r.content_hash,
        currentVersion: JSON.parse(r.analyser_versions ?? '{}')[analyser] ?? null })));
      cursor = page.cursor.next;
    } while (cursor && affected.length < limit);
    return { analyser, targetVersion: version, affected: affected.slice(0, limit),
             count: Math.min(affected.length, limit) };
  }

  /**
   * REQ-032: reprocessing works from stored raw or canonical data, never from the
   * source - unless the bytes have expired under REQ-098, which the caller must handle.
   */
  async enqueue({ analyser, version, trigger = REANALYSIS_TRIGGER.ANALYSER_VERSION,
                  queueName = 'reanalysis', limit = 1000, dryRun = false }) {
    const { affected, count } = await this.plan({ analyser, version, limit });
    if (dryRun || !this.#queue) {
      return { enqueued: 0, planned: count, dryRun: true, trigger, affected };
    }
    for (const a of affected) {
      this.#queue.send(queueName,
        { canonical_id: a.id, content_hash: a.contentHash, analyser, target_version: version, trigger },
        { idempotencyKey: `reanalyse:${analyser}:${version}:${a.id}` });
    }
    return { enqueued: count, planned: count, dryRun: false, trigger };
  }
}
