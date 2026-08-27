/**
 * Author correction and removal. DES-042, DES-022. REQ-063, DEC-015, ETH-002.
 *
 * Skill authors did not opt in to being indexed. A system that structurally cannot
 * honour a removal request has decided that question in advance, against the party
 * with the least power in the arrangement - which is why REQ-063 is mandatory in
 * Phase 1 even though Phase 1 exposes no content.
 */
import { STAGE } from '../../skill-core/src/index.js';

export const REQUEST_KIND = Object.freeze({ REMOVAL: 'removal', CORRECTION: 'correction' });
export const DISPOSITION = Object.freeze({
  PENDING: 'pending', ACTIONED: 'actioned', DECLINED: 'declined',
});

export class RemovalService {
  #store; #objects; #clock;

  /** @param objects an ObjectStore port, or null when no byte store is attached. */
  constructor({ store, objects = null, clock }) {
    if (!store || typeof clock !== 'function') {
      throw new TypeError('RemovalService requires a CanonicalStore port and a clock (NFR-038)');
    }
    this.#store = store; this.#objects = objects; this.#clock = clock;
  }

  /**
   * Records the request FIRST, before deciding anything. A refusal that leaves no
   * trace is indistinguishable from never having been asked.
   */
  submit({ requestId, canonicalId = null, repository, kind = REQUEST_KIND.REMOVAL,
           reason, requestedBy }) {
    if (!repository) throw new Error('REQ-063 violated: a request must name a repository');
    if (!reason) throw new Error('REQ-063 violated: a request must carry a reason');
    if (!requestedBy) throw new Error('REQ-063 violated: a request must name its requester');
    if (!Object.values(REQUEST_KIND).includes(kind)) throw new Error(`unknown request kind: ${kind}`);

    const record = this.#store.getCanonical?.(canonicalId) ?? null;
    this.#store.recordRemovalRequest({
      requestId, canonicalId, contentHash: record?.content_hash ?? null,
      repository, kind, reason, requestedBy,
      requestedAt: this.#clock(), disposition: DISPOSITION.PENDING,
    });
    return { requestId, disposition: DISPOSITION.PENDING };
  }

  /**
   * DEC-015: deletes the BYTES; the provenance envelope and the tombstone survive
   * permanently. The canonical record is retained and marked, because an index that
   * silently loses records is not an index - and because attribution is what the
   * author is owed even after removal.
   */
  async action({ requestId, actor, dispositionReason = null }) {
    const req = this.#store.getRemovalRequest(requestId);
    if (!req) throw new Error(`removal request not found: ${requestId}`);
    if (req.disposition !== DISPOSITION.PENDING) {
      throw new Error(`request ${requestId} is already ${req.disposition}`);
    }
    const now = this.#clock();
    const canonical = req.canonical_id ? this.#store.getCanonical(req.canonical_id) : null;

    let bytesDeleted = false;
    if (canonical) {
      if (this.#objects && canonical.content_hash) {
        await this.#objects.delete(canonical.content_hash);
        bytesDeleted = true;
      }
      this.#store.tombstone({
        contentHash: canonical.content_hash, reason: req.reason, actor, now,
        // The envelope outlives the bytes: who, what, where, and under what claim.
        provenance: {
          canonical_id: canonical.id,
          repository: canonical.attribution_repository,
          owner: canonical.attribution_owner,
          canonical_source_url: canonical.attribution_url,
          content_hash: canonical.content_hash,
          request_id: requestId,
          requested_by: req.requested_by,
          requested_at: req.requested_at,
          kind: req.kind,
        },
      });
      this.#store.markTombstoned({ canonicalId: canonical.id, now });
    }

    this.#store.recordRemovalRequest({
      requestId: req.request_id, canonicalId: req.canonical_id, contentHash: req.content_hash,
      repository: req.repository, kind: req.kind, reason: req.reason,
      requestedBy: req.requested_by, requestedAt: req.requested_at,
      disposition: DISPOSITION.ACTIONED, dispositionReason, actionedAt: now, actor,
    });
    return { requestId, disposition: DISPOSITION.ACTIONED, bytesDeleted, tombstoned: !!canonical };
  }

  /** A decline is recorded with its reason, and remains visible to the requester. */
  decline({ requestId, actor, dispositionReason }) {
    const req = this.#store.getRemovalRequest(requestId);
    if (!req) throw new Error(`removal request not found: ${requestId}`);
    if (!dispositionReason) throw new Error('REQ-063 violated: a decline must carry a reason');
    this.#store.recordRemovalRequest({
      requestId: req.request_id, canonicalId: req.canonical_id, contentHash: req.content_hash,
      repository: req.repository, kind: req.kind, reason: req.reason,
      requestedBy: req.requested_by, requestedAt: req.requested_at,
      disposition: DISPOSITION.DECLINED, dispositionReason,
      actionedAt: this.#clock(), actor,
    });
    return { requestId, disposition: DISPOSITION.DECLINED };
  }

  history(repository) { return this.#store.listRemovalRequests({ repository }); }

  /**
   * NFR-010: a rebuild after tombstoning is "equivalent MINUS tombstoned records".
   * The count is reported rather than the difference being quietly absorbed.
   */
  rebuildReport() {
    const counts = this.#store.counts();
    return { canonical: counts.canonical, tombstoned: this.#store.tombstonedCount(),
             servable: counts.canonical - this.#store.tombstonedCount(),
             note: 'A rebuilt index is equivalent minus tombstoned records, never identical.' };
  }
}
