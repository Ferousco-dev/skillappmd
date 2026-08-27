/**
 * Types transcribed from docs/API.md v1.0. Nothing here is invented.
 *
 * Where the contract does not define a shape, the type says so explicitly with
 * a TODO rather than guessing, so a component can never quietly depend on a
 * field the backend does not emit.
 */

/** API.md §2. Present on every successful response. */
export type Meta = {
  request_id: string
  /** ISO 8601 */
  generated_at: string
}

/**
 * API.md §4. Cursors are opaque and encode (sort_key, id).
 * `next: null` means the end of the collection.
 * There is no offset and no total, so a page number cannot be derived.
 */
export type Cursor = {
  next: string | null
  limit: number
}

/**
 * API.md §2. Not optional: "The serializer cannot emit a record without it,
 * because the record could not have been written without it." (REQ-061, NFR-004)
 */
export type Attribution = {
  repository: string
  owner: string
  canonical_source_url: string
}

/**
 * API.md §3. Three states, and `unknown` is deliberately distinct from a
 * negative answer (DEC-018). The UI must never collapse them.
 */
/**
 * TWO states. Verified against packages/skill-core rights.js, which defines exactly
 * `known` and `unknown`.
 *
 * There is no `restricted`. A licence that forbids redistribution is still a KNOWN
 * licence — it reports `state: 'known'` with `redistributable: false`. Modelling a third
 * state let the UI render a category the backend cannot produce (DEC-018).
 */
export type RightsState = 'known' | 'unknown'

export type Rights = {
  state: RightsState
  redistributable: boolean
  basis: string
}

/**
 * API.md §3. `declared` holds source facts, `inferred` holds derived claims,
 * and they are separate objects so a consumer cannot read an inference as a
 * fact by accident (REQ-070). `inferred` is empty in Phase 1.
 */
export type Declared = {
  name: string
  description: string
}

export type Inferred = Record<string, never>

export type Skill = {
  id: string
  schema_version: number
  declared: Declared
  inferred: Inferred
  identity: Identity
  licence: Licence
  rights: Rights
  /**
   * Attribution belongs to the RECORD, not the envelope. The API refuses to serve a
   * skill without it (REQ-061, NFR-004), so it is never optional.
   *
   * Corrected 2026-08-27 against live API output. It had been modelled on the envelope,
   * which forced SkillResult to synthesise attribution locally - producing
   * `unknown/unknown` and a source link to a repository that does not exist.
   */
  attribution: Attribution
  /** REQ-062: always null. SkillAppMD serves no third-party content under any licence. */
  content: null
  content_available: false
}

/** Two-tier fingerprint. Equal `normalised_hash` means the same file, differently saved. */
export type Identity = {
  content_hash: string
  normalised_hash: string
}

/** Three layers, never merged. `conflict` is set when they disagree. */
export type Licence = {
  l1_dataset: { spdx: string; evidence: string | null }
  l2_repository: { spdx: string; evidence: string | null }
  l3_declared: { spdx: string; evidence: string | null }
  conflict: boolean
}

/**
 * TODO - BACKEND CONTRACT REQUIRED.
 * `GET /skills/:id/occurrences` is listed in API.md §1 but its record shape is
 * not specified. Only the fields guaranteed by the envelope are modelled.
 */
export type Occurrence = {
  id: string
}

/**
 * TODO - BACKEND CONTRACT REQUIRED.
 * `GET /sources/:id` is listed in API.md §1 but its record shape is not
 * specified.
 */
export type Source = {
  id: string
}

/** API.md §2. Every successful response is wrapped in this envelope. */
export type Envelope<T> = {
  data: T
  meta: Meta
  cursor?: Cursor
  notice: string
}

/** API.md §7. Codes are the contract; messages are for humans. */
export type ApiErrorBody = {
  error: {
    code: string
    message: string
    request_id: string
  }
}
