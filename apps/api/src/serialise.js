/**
 * Response serialisation. DES-051. REQ-061, REQ-062, REQ-070, REQ-071, REQ-093.
 *
 * The serialiser is the LAST place a record can lose its attribution, so it is
 * built to be structurally incapable of emitting one without it (NFR-004).
 */

export const NOTICE =
  'Skills are indexed from public repositories. Each is subject to its own repository ' +
  'licence. AppMD does not certify or verify any skill.';

/** REQ-093 / DEC-020: only the public handle and the canonical URL leave the system. */
export function serialiseSkill(row) {
  if (!row) return null;
  if (!row.attribution_repository || !row.attribution_owner || !row.attribution_url) {
    // REQ-061: not a filter, a refusal. A record without attribution should never
    // have been written (NFR-004); if one exists, emitting it is the worse failure.
    throw new Error('REQ-061 violated: refusing to serialise a record without attribution');
  }

  const licence = JSON.parse(row.licence_json);
  const rights = JSON.parse(row.rights_json);
  const provenance = JSON.parse(row.provenance_json);
  const declared = JSON.parse(row.declared_json);

  return {
    id: row.id,
    schema_version: row.schema_version,

    // DOM-006 / REQ-070: source facts and AppMD inferences are structurally separate.
    // A consumer cannot read one as the other by accident.
    declared: {
      name: declared.name ?? null,
      description: declared.description ?? null,
      frontmatter: declared.frontmatter ?? {},     // REQ-036: unknown keys preserved
      allowed_tools: declared.allowed_tools ?? null,
    },
    inferred: JSON.parse(row.inferred_json ?? '{}'),

    identity: {
      content_hash: row.content_hash,
      normalised_hash: row.normalised_hash,
    },

    licence: {
      l1_dataset: licence.l1_dataset,
      l2_repository: licence.l2_repository,
      l3_declared: licence.l3_declared,
      conflict: licence.conflict,
    },

    // DEC-018: `unknown` travels on the wire, so a consumer can distinguish
    // "we know you may not" from "we do not know".
    rights: {
      state: rights.state,
      indexable: rights.indexable,
      linkable: rights.linkable,
      redistributable: rights.redistributable,
      cacheable: rights.cacheable,
      basis: rights.basis,
      computed_at: rights.computed_at,
    },

    temporal: {
      first_commit_at: row.first_commit_at,
      last_commit_at: row.last_commit_at,
      discovered_at: row.discovered_at,
      last_verified_at: row.last_verified_at,
    },

    provenance: {
      sources: provenance.sources ?? [],
      field_origins: provenance.field_origins ?? {},
    },

    attribution: attributionOf(row),

    // REQ-062 / DEC-009: never, under any licence, in Phase 1.
    content: null,
    content_available: false,
    content_notice: 'AppMD does not serve third-party skill content. Follow canonical_source_url.',
  };
}

export function serialiseOccurrence(row) {
  return {
    occurrence_key: row.occurrence_key,
    source: row.source_id,
    repository: row.repo_full_name,
    path: row.path,
    canonical_id: row.canonical_id,
    relationship: row.relationship,
    relationship_reason: row.relationship_reason,
    discovered_at: row.discovered_at,
    canonical_source_url: `https://github.com/${row.repo_full_name}/blob/HEAD/${row.path}`,
  };
}

export const attributionOf = (row) => ({
  repository: row.attribution_repository,
  owner: row.attribution_owner,
  canonical_source_url: row.attribution_url,
});

export function envelope(data, { requestId, generatedAt, cursor = null }) {
  return { data, meta: { request_id: requestId, generated_at: generatedAt },
           ...(cursor ? { cursor } : {}), notice: NOTICE };
}

/** REQ-071: a stable machine-readable code; the message is for humans. */
export const errorBody = (code, message, requestId) => ({ error: { code, message, request_id: requestId } });
