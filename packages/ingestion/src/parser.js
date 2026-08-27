/**
 * SKILL.md parser. DES-023, DES-024. REQ-035..REQ-038, REQ-041, NFR-022.
 *
 * Spec: only `name` and `description` are required, and spec-compliant runtimes
 * IGNORE unrecognised frontmatter keys. So the parser PRESERVES unknown keys and
 * never rejects on them (REQ-036) - rejecting would make AppMD stricter than the
 * runtimes it serves, and would discard exactly the metadata future phases need.
 */
import { splitDocument, parseFrontmatter, FrontmatterError, LIMITS } from './frontmatter.js';

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

/** REQ-037: a closed taxonomy, so a failure is data rather than a surprise. */
export const PARSE_FAILURE = Object.freeze({
  NOT_TEXT: 'not_text',
  EMPTY: 'empty',
  TOO_LARGE: 'too_large',
  INVALID_UTF8: 'invalid_utf8',
  MALFORMED_YAML: 'malformed_yaml',
  UNTERMINATED_FRONTMATTER: 'unterminated_frontmatter',
});

/** REQ-038: the spec's stated constraints, and only those. */
export const NAME_RE = /^[a-z0-9-]{1,64}$/;
export const RESERVED = ['anthropic', 'claude'];
export const MAX_NAME = 64;
export const MAX_DESCRIPTION = 1024;
const XML_TAG = /<[^>]+>/;

/**
 * Never throws. A malformed SKILL.md is DATA, not a system failure
 * (INGESTION.md §1), so it returns a recorded reason instead.
 */
export function parseSkill(input) {
  let text = input;
  if (input instanceof Uint8Array) {
    // REQ-037: invalid UTF-8 must fail cleanly, not produce silent replacement noise.
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(input);
    if (decoded.includes('�')) {
      return fail(PARSE_FAILURE.INVALID_UTF8, 'content is not valid UTF-8');
    }
    text = decoded;
  }
  if (typeof text !== 'string') return fail(PARSE_FAILURE.NOT_TEXT, 'content is not text');
  if (text.trim() === '') return fail(PARSE_FAILURE.EMPTY, 'document is empty');
  if (Buffer.byteLength(text, 'utf8') > MAX_DOCUMENT_BYTES) {
    return fail(PARSE_FAILURE.TOO_LARGE, `document exceeds ${MAX_DOCUMENT_BYTES} bytes`);
  }

  let split;
  try { split = splitDocument(text); }
  catch (e) { return fail(PARSE_FAILURE.MALFORMED_YAML, e.message); }

  if (split.unterminated) {
    return fail(PARSE_FAILURE.UNTERMINATED_FRONTMATTER, 'frontmatter fence opened but never closed');
  }

  let frontmatter;
  try { frontmatter = parseFrontmatter(split.frontmatterText); }
  catch (e) {
    if (e instanceof FrontmatterError) {
      return fail(PARSE_FAILURE.MALFORMED_YAML, e.line ? `${e.message} (line ${e.line})` : e.message);
    }
    throw e;
  }

  const validity = validateFrontmatter(frontmatter, { hadFrontmatter: split.frontmatterText !== null });
  return {
    ok: true,
    frontmatter,                       // REQ-036: unknown keys preserved verbatim
    body: split.body,
    bodyChars: split.body.length,
    hadFrontmatter: split.frontmatterText !== null,
    frontmatterValid: validity.structurallyValid,   // comparable to the corpus oracle
    specConformant: validity.specConformant,        // AppMD inference, stricter (DOM-006)
    validityReasons: validity.reasons,
    structuralReasons: validity.structuralReasons,
    validityWarnings: validity.warnings,
    allowedTools: normaliseAllowedTools(frontmatter),   // REQ-075: security-relevant
  };
}

/**
 * REQ-038 / CR-004. TWO verdicts, because two different questions are being asked:
 *
 *   structurallyValid - did frontmatter parse, and are `name` and `description` present
 *                       and non-empty? This is what the GitSkills oracle measures, and
 *                       it is what NFR-003 must be graded against.
 *   specConformant    - does it additionally satisfy the Agent Skills spec's charset,
 *                       length and content rules? This is an APPMD INFERENCE (DOM-006),
 *                       stricter than the oracle, and ours to defend.
 *
 * Collapsing them produced a 93.1% "agreement" that measured nothing, because the two
 * sides were answering different questions.
 */
export function validateFrontmatter(fm, { hadFrontmatter = true } = {}) {
  const reasons = [];
  const warnings = [];
  const none = (r) => ({ structurallyValid: false, specConformant: false, valid: false,
                         structuralReasons: [r], reasons: [r], warnings });
  if (!hadFrontmatter) return none('no frontmatter block');
  if (fm === null || typeof fm !== 'object') return none('frontmatter is not a map');

  const structural = [];
  const name = fm.name;
  if (name === undefined || name === null || String(name).trim() === '') structural.push('name is required');
  else if (typeof name !== 'string') structural.push('name must be a string');
  else {
    if (name.length > MAX_NAME) reasons.push(`name exceeds ${MAX_NAME} characters`);
    if (!NAME_RE.test(name)) reasons.push('name must match [a-z0-9-]');
    if (XML_TAG.test(name)) reasons.push('name contains an XML tag');
    // DEC-033: reserved words are reported as a WARNING, not a validity failure.
    // The spec's "cannot contain ... reserved words" is ambiguous between "must not
    // BE" and "must not CONTAIN", and the corpus oracle treats names like
    // `plain-english-claude` as valid. Marking a real author's skill invalid on a
    // contested reading is a judgement we publish about a third party (ETH-001), so
    // the stricter reading is recorded as a signal rather than imposed as a verdict.
    for (const w of RESERVED) {
      if (name.toLowerCase() === w) reasons.push(`name is the reserved word "${w}"`);
      else if (name.toLowerCase().includes(w)) warnings.push(`name contains reserved word "${w}"`);
    }
  }

  const d = fm.description;
  if (d === undefined || d === null || String(d).trim() === '') structural.push('description is required');
  else if (typeof d !== 'string') structural.push('description must be a string');
  else {
    if (d.length > MAX_DESCRIPTION) reasons.push(`description exceeds ${MAX_DESCRIPTION} characters`);
    // DEC-033: an angle-bracket placeholder such as `context/changes/<change-name>` is
    // indistinguishable from markup by regex. Publishing "invalid" over that would be an
    // adverse judgement about a third party's work on a contested reading (ETH-001), so
    // it warns rather than invalidates.
    if (XML_TAG.test(d)) warnings.push('description contains angle brackets that may be an XML tag');
  }

  const structurallyValid = structural.length === 0;
  return {
    structurallyValid,
    specConformant: structurallyValid && reasons.length === 0,
    valid: structurallyValid,                 // the comparable verdict (NFR-003)
    structuralReasons: structural,
    reasons: [...structural, ...reasons],
    warnings,
  };
}

function normaliseAllowedTools(fm) {
  const v = fm?.['allowed-tools'] ?? fm?.allowed_tools ?? null;
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(String);
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

const fail = (code, reason) => ({ ok: false, code, reason, frontmatterValid: false });
