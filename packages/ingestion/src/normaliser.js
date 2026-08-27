/**
 * Normaliser. DES-025, DES-041, DES-036. REQ-039, REQ-040, NFR-004, NFR-005.
 *
 * Produces the canonical record. Attribution is a WRITE-TIME invariant: a record
 * without it cannot be built here, and the database refuses it too (DEC-031).
 */
import { contentHash, normalisedHash, partitionKey, sourceFact, appmdInference,
         assertAttribution, assertAllFieldsClassified, computeRights, retentionFor,
         assertRightsInvariant, IDENTITY_CLASS } from '../../skill-core/src/index.js';

export const NORMALISER_VERSION = '0.1.0';

export function normalise({ discovery, parsed, rawText, repoLicence = null, now }) {
  if (typeof now !== 'string') throw new TypeError('normalise requires an explicit UTC timestamp (NFR-038)');

  const attribution = {
    repository: discovery.repo_full_name,
    owner: discovery.author,
    canonical_source_url: discovery.url,
    path: discovery.path,
  };
  assertAttribution(attribution);                      // NFR-004: rejected here, not filtered later

  const ch = contentHash(rawText);
  const nh = normalisedHash(rawText);

  // DEC-006: L2 is the repository licence; L3 is the author's CLAIM in frontmatter.
  const rights = computeRights({
    l1: { spdx: 'CC-BY-4.0', evidence: `dataset:${discovery.source}` },
    l2: repoLicence ? { spdx: repoLicence, evidence: 'repos.license' } : null,
    l3: parsed.ok && parsed.frontmatter?.license
        ? { spdx: parsed.frontmatter.license, evidence: 'frontmatter.license' } : null,
  }, { now });
  assertRightsInvariant(rights);                       // NFR-006

  // DOM-006: source facts and AppMD inferences are structurally separate, never merged.
  const declared = parsed.ok ? {
    name: parsed.frontmatter?.name ?? null,
    description: parsed.frontmatter?.description ?? null,
    frontmatter: parsed.frontmatter,                   // REQ-036: unknown keys preserved
    allowed_tools: parsed.allowedTools,
  } : { name: null, description: null, frontmatter: {}, allowed_tools: null };

  const fieldOrigins = {
    'declared.name': sourceFact(discovery.source, 'frontmatter.name'),
    'declared.description': sourceFact(discovery.source, 'frontmatter.description'),
    'declared.frontmatter': sourceFact(discovery.source),
    'licence.l2_repository': repoLicence ? sourceFact(discovery.source, 'repos.license')
                                         : appmdInference('rights-engine', NORMALISER_VERSION),
    'licence.l3_declared': sourceFact(discovery.source, 'frontmatter.license'),
    'rights.redistributable': appmdInference('rights-engine', NORMALISER_VERSION),
    'identity.content_hash': appmdInference('fingerprint', NORMALISER_VERSION),
    'declared.frontmatter_valid': appmdInference('parser', NORMALISER_VERSION),
  };
  assertAllFieldsClassified(fieldOrigins);             // NFR-005

  return {
    id: `cs_${ch.slice(7, 27)}`,
    contentHash: ch,
    normalisedHash: nh,
    partitionKey: partitionKey(ch),
    declared,
    frontmatterValid: parsed.ok ? parsed.frontmatterValid : false,
    inferred: {},                                      // empty in Phase 1; the shape exists
    licence: rights.licence,
    rights,
    retentionPolicy: retentionFor(rights),
    provenance: {
      sources: [{ source_id: discovery.source, external_ref: discovery.external_id,
                  channel: discovery.channel ?? 'local', at: now }],
      field_origins: fieldOrigins,
      normaliser_version: NORMALISER_VERSION,
    },
    attribution,
    identityClass: IDENTITY_CLASS.INDIVIDUAL,          // REQ-092; refined when org data exists
    temporal: {
      first_commit_at: discovery.source_payload?.first_commit_at ?? null,
      last_commit_at: discovery.source_payload?.last_commit_at ?? null,
      discovered_at: discovery.discovered_at ?? now,
      last_verified_at: now,
    },
    now,
  };
}
