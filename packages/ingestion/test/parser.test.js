import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSkill, validateFrontmatter, PARSE_FAILURE, MAX_DESCRIPTION } from '../src/parser.js';
import { parseFrontmatter, splitDocument, LIMITS } from '../src/frontmatter.js';

const doc = (fm, body = 'Body text.') => `---\n${fm}\n---\n${body}`;
const VALID = doc('name: my-skill\ndescription: Does a thing when asked.');

test('TC-093 REQ-035 a valid SKILL.md yields frontmatter and body', async () => {
  const r = parseSkill(VALID);
  assert.equal(r.ok, true);
  assert.equal(r.frontmatter.name, 'my-skill');
  assert.equal(r.body.trim(), 'Body text.');
  assert.equal(r.frontmatterValid, true);
});

test('TC-094 REQ-036 unrecognised frontmatter keys are PRESERVED, not rejected', async () => {
  // Spec-compliant runtimes ignore unknown keys. Rejecting would make AppMD stricter
  // than the runtimes it serves and would discard metadata future phases need.
  const r = parseSkill(doc(
    'name: my-skill\ndescription: d\nx-vendor-thing: keep me\nnested:\n  deep: value'));
  assert.equal(r.ok, true);
  assert.equal(r.frontmatterValid, true, 'unknown keys must not invalidate');
  assert.equal(r.frontmatter['x-vendor-thing'], 'keep me');
  assert.deepEqual(r.frontmatter.nested, { deep: 'value' });
});

test('TC-095 REQ-038/CR-004 name charset and length are SPEC-conformance rules', async () => {
  const ok = validateFrontmatter({ name: 'ok-name-1', description: 'd' });
  assert.equal(ok.structurallyValid, true);
  assert.equal(ok.specConformant, true);
  for (const [name, needle] of [
    ['Bad-Caps', /\[a-z0-9-\]/], ['has space', /\[a-z0-9-\]/],
    ['x'.repeat(65), /exceeds 64/],
    ['claude', /is the reserved word "claude"/],
    ['anthropic', /is the reserved word "anthropic"/],
  ]) {
    const v = validateFrontmatter({ name, description: 'd' });
    assert.equal(v.specConformant, false, `${name} should not be spec-conformant`);
    assert.ok(v.reasons.some((r) => needle.test(r)), `reason for ${name}: ${v.reasons}`);
  }
  // A name like `Polymarket` violates the spec charset but IS structurally present.
  // The corpus oracle counts it valid; conflating the two made NFR-003 meaningless.
  const cased = validateFrontmatter({ name: 'Polymarket', description: 'd' });
  assert.equal(cased.structurallyValid, true, 'structurally present');
  assert.equal(cased.specConformant, false, 'but not spec-conformant');
});

test('TC-108 DEC-033 a name CONTAINING a reserved word warns but stays valid', async () => {
  // The spec's wording is ambiguous between "must not BE" and "must not CONTAIN".
  // The corpus oracle treats `plain-english-claude` as valid, and marking a real
  // author's skill invalid on a contested reading is a judgement about a third
  // party (ETH-001). So: warn, do not invalidate.
  const v = validateFrontmatter({ name: 'plain-english-claude', description: 'd' });
  assert.equal(v.structurallyValid, true);
  assert.equal(v.specConformant, true);
  assert.deepEqual(v.reasons, []);
  assert.ok(v.warnings.some((w) => /reserved word "claude"/.test(w)), 'the signal is retained');
  assert.equal(validateFrontmatter({ name: 'claude', description: 'd' }).specConformant, false,
    'a name that IS the reserved word is still non-conformant');
});

test('TC-109 DEF-002 YAML block scalars parse: >, >-, |, and implicit multi-line', async () => {
  const shapes = {
    folded: '---\nname: a\ndescription: >\n  Line one.\n  Line two.\n---\nb',
    foldedStrip: '---\nname: b\ndescription: >-\n  Only line.\n---\nb',
    literal: '---\nname: c\ndescription: |\n  one\n  two\n---\nb',
    implicit: '---\nname: d\ndescription:\n  Indented prose with no key of its own.\n---\nb',
  };
  for (const [label, src] of Object.entries(shapes)) {
    const r = parseSkill(src);
    assert.equal(r.ok, true, `${label} must parse`);
    assert.equal(r.frontmatterValid, true, `${label} must be valid`);
    assert.ok(String(r.frontmatter.description).length > 0, `${label} description non-empty`);
  }
  assert.equal(parseSkill(shapes.folded).frontmatter.description, 'Line one. Line two.',
    'folded scalars join lines with a space');
  assert.equal(parseSkill(shapes.literal).frontmatter.description, 'one\ntwo',
    'literal scalars keep newlines');
});

test('TC-096 REQ-038 description: absence is structural, length and markup are conformance', async () => {
  assert.equal(validateFrontmatter({ name: 'n' }).structurallyValid, false, 'missing is structural');
  assert.equal(validateFrontmatter({ name: 'n', description: '  ' }).structurallyValid, false);
  const long = validateFrontmatter({ name: 'n', description: 'x'.repeat(MAX_DESCRIPTION + 1) });
  assert.equal(long.structurallyValid, true, 'present, so structurally valid');
  assert.equal(long.specConformant, false, 'but over the spec limit');
  // DEC-033: `context/changes/<change-name>` is indistinguishable from markup by regex.
  const angled = validateFrontmatter({ name: 'n', description: 'path/<change-name> here' });
  assert.equal(angled.specConformant, true, 'warns rather than invalidating a third party');
  assert.ok(angled.warnings.some((w) => /angle brackets/.test(w)));
});

test('TC-097 REQ-038 a verdict always carries its reasons', async () => {
  const v = validateFrontmatter({ name: 'BAD NAME' });
  assert.equal(v.structurallyValid, false, 'description absent');
  assert.equal(v.specConformant, false);
  assert.ok(v.reasons.length >= 2, 'both name and description problems reported');
  assert.ok(v.structuralReasons.some((r) => /description is required/.test(r)),
    'structural reasons are separable from conformance reasons');
});

test('TC-098 REQ-037 malformed input fails cleanly with a recorded reason, never throws', async () => {
  const cases = [
    ['', PARSE_FAILURE.EMPTY],
    ['   \n  ', PARSE_FAILURE.EMPTY],
    [42, PARSE_FAILURE.NOT_TEXT],
    ['---\nname: x\nno closing fence', PARSE_FAILURE.UNTERMINATED_FRONTMATTER],
    [doc('this line has no colon'), PARSE_FAILURE.MALFORMED_YAML],
    [doc('a: &anchor 1\nb: *anchor'), PARSE_FAILURE.MALFORMED_YAML],
  ];
  for (const [input, code] of cases) {
    let r;
    assert.doesNotThrow(() => { r = parseSkill(input); }, `must not throw for ${JSON.stringify(String(input).slice(0, 30))}`);
    assert.equal(r.ok, false);
    assert.equal(r.code, code);
    assert.ok(r.reason.length > 0, 'a failure must carry a reason');
    assert.equal(r.frontmatterValid, false);
  }
});

test('TC-099 REQ-035 a document with no frontmatter parses as body-only and is invalid', async () => {
  const r = parseSkill('# Just markdown\nno frontmatter here');
  assert.equal(r.ok, true, 'absent frontmatter is not a parse failure');
  assert.equal(r.hadFrontmatter, false);
  assert.equal(r.frontmatterValid, false);
  assert.equal(r.validityReasons[0], 'no frontmatter block');
});

test('TC-100 NFR-022 a YAML expansion attack is rejected, not expanded', async () => {
  const bomb = doc(['a: &a ["x","x","x","x","x","x","x","x","x"]',
    'b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]', 'c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]'].join('\n'));
  const t0 = Date.now();
  const r = parseSkill(bomb);
  assert.equal(r.ok, false);
  assert.match(r.reason, /anchors and aliases/);
  assert.ok(Date.now() - t0 < 200, 'rejection must be immediate, not after expansion');
});

test('TC-101 NFR-022 oversized documents and scalars are refused', async () => {
  const big = parseSkill('---\nname: x\n---\n' + 'y'.repeat(6 * 1024 * 1024));
  assert.equal(big.ok, false);
  assert.equal(big.code, PARSE_FAILURE.TOO_LARGE);
  const wide = parseSkill(doc(`name: x\ndescription: ${'z'.repeat(LIMITS.MAX_SCALAR + 10)}`));
  assert.equal(wide.ok, false);
  assert.match(wide.reason, /scalar too large/);
});

test('TC-102 NFR-022 deep nesting is bounded', async () => {
  let fm = 'name: x\ndescription: d\n';
  for (let i = 0; i < 20; i++) fm += `${' '.repeat(i * 2)}k${i}:\n`;
  const r = parseSkill(doc(fm));
  assert.equal(r.ok, false);
  assert.match(r.reason, /nesting deeper than/);
});

test('TC-103 NFR-022 invalid UTF-8 fails cleanly rather than producing replacement noise', async () => {
  const bad = new Uint8Array([0x2d, 0x2d, 0x2d, 0x0a, 0xff, 0xfe, 0x0a, 0x2d, 0x2d, 0x2d]);
  const r = parseSkill(bad);
  assert.equal(r.ok, false);
  assert.equal(r.code, PARSE_FAILURE.INVALID_UTF8);
});

test('TC-104 NFR-022 prototype-polluting keys are refused', async () => {
  const r = parseSkill(doc('name: x\ndescription: d\n__proto__: polluted'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /unsafe key name/);
  assert.equal({}.polluted, undefined, 'the prototype must be untouched');
});

test('TC-105 REQ-075 allowed-tools is parsed as a list, not merely stored', async () => {
  assert.deepEqual(parseSkill(doc('name: x\ndescription: d\nallowed-tools: [Read, Bash]')).allowedTools,
    ['Read', 'Bash']);
  assert.deepEqual(parseSkill(doc('name: x\ndescription: d\nallowed-tools: Read, Bash')).allowedTools,
    ['Read', 'Bash']);
  assert.equal(parseSkill(VALID).allowedTools, null);
});

test('TC-106 REQ-035 CRLF and BOM do not defeat frontmatter detection', async () => {
  const r = parseSkill('﻿---\r\nname: my-skill\r\ndescription: d\r\n---\r\nbody');
  assert.equal(r.ok, true);
  assert.equal(r.frontmatterValid, true);
  assert.equal(r.frontmatter.name, 'my-skill');
});

test('TC-107 REQ-035 comments and blank lines are ignored', async () => {
  const r = parseSkill(doc('# a comment\n\nname: my-skill\n\n# another\ndescription: d'));
  assert.equal(r.frontmatterValid, true);
});

test('TC-110 CR-004 the two verdicts are reported separately, never collapsed', async () => {
  const r = parseSkill('---\nname: Polymarket\ndescription: Trending markets.\n---\nbody');
  assert.equal(r.ok, true);
  assert.equal(r.frontmatterValid, true, 'structural: comparable to the corpus oracle');
  assert.equal(r.specConformant, false, 'conformance: an AppMD inference, stricter');
  assert.ok(r.validityReasons.some((x) => /\[a-z0-9-\]/.test(x)));
  // DOM-006: the stricter verdict is OUR conclusion, not a fact the source asserted.
  assert.notEqual(r.frontmatterValid, r.specConformant);
});


test('TC-167 DEF-005 markdown emphasis is not a YAML alias', async () => {
  // Real case: a description containing *SummarizedExperiment* was rejected as an
  // anchor. A guard that refuses legitimate documents is a defect that LOOKS like a
  // security win, which is the most expensive kind to notice.
  const r = parseSkill('---\nname: a\ndescription: uses *SummarizedExperiment* and R&D notes\n---\nb');
  assert.equal(r.ok, true);
  assert.equal(r.frontmatterValid, true);
  // The genuine constructs are still refused.
  for (const bad of ['---\nname: a\ndescription: d\nx: &anchor 1\ny: *anchor\n---\nb',
                     '---\nname: a\ndescription: d\nx: !!python/object:os.system\n---\nb']) {
    assert.equal(parseSkill(bad).ok, false, 'a real anchor or tag must still be rejected');
  }
});

test('TC-168 DEF-005 a sequence of maps parses (real shape: `arguments:`)', async () => {
  const r = parseSkill([
    '---', 'name: release-report', 'description: d', 'arguments:',
    '  - name: branch-source', '    description: Source branch', '    required: true',
    '  - name: branch-target', '    description: Target branch', '    required: false',
    '---', 'body'].join('\n'));
  assert.equal(r.ok, true);
  assert.equal(r.frontmatterValid, true);
  assert.equal(r.frontmatter.arguments.length, 2);
  assert.equal(r.frontmatter.arguments[0].name, 'branch-source');
  assert.equal(r.frontmatter.arguments[0].required, true);
  assert.equal(r.frontmatter.arguments[1].required, false);
});

test('TC-169 DEF-005 a plain scalar wrapping onto indented lines is joined', async () => {
  const r = parseSkill([
    '---', 'name: cv-ratio',
    'description: Use when after normalizing a feature matrix when you have',
    '  both study samples and QC replicates in the same experiment.',
    '  Use it to remove features that are poorly reproducible.',
    'license: CC-BY-4.0', '---', 'body'].join('\n'));
  assert.equal(r.ok, true);
  assert.match(r.frontmatter.description, /^Use when after normalizing/);
  assert.match(r.frontmatter.description, /poorly reproducible\.$/);
  assert.equal(r.frontmatter.license, 'CC-BY-4.0', 'the following key is not swallowed');
});

test('TC-170 DEF-005 block sequences at the parent indent parse (real shape: edam_topics)', async () => {
  const r = parseSkill([
    '---', 'name: a', 'description: d', 'metadata:',
    '  edam_operation: http://edamontology.org/operation_3695',
    '  edam_topics:',
    '  - http://edamontology.org/topic_0091',
    '  - http://edamontology.org/topic_3172',
    '  tools:', '  - R', '  - notame', '---', 'b'].join('\n'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.frontmatter.metadata.tools, ['R', 'notame']);
  assert.equal(r.frontmatter.metadata.edam_topics.length, 2);
});

test('TC-171 DEF-005 a wrapped sequence item is joined, not rejected', async () => {
  const r = parseSkill([
    '---', 'name: a', 'description: d', 'notes:',
    '- Internally, mzQuality uses a SummarizedExperiment object to store',
    '  the data and its metadata together.',
    '- A second note.', '---', 'b'].join('\n'));
  assert.equal(r.ok, true);
  assert.equal(r.frontmatter.notes.length, 2);
  assert.match(r.frontmatter.notes[0], /metadata together\.$/);
});

test('TC-172 REQ-037 genuinely malformed documents still fail, with a reason', async () => {
  // The two that remain unparsed in a 438-document real sample, and should.
  // NeuralBlitz/Mito: a fence opened and never closed.
  const unterminated = parseSkill('---\nname: a\n\n## not frontmatter\n');
  assert.equal(unterminated.ok, false);
  assert.equal(unterminated.code, 'unterminated_frontmatter');

  // Kimurist2024/rverythong-skills: a stray quote on its own line, left behind by an
  // unbalanced multi-line quoted string. It has no colon, so it is not a key/value pair.
  const stray = parseSkill(['---', 'name: a', "description: 'opening quote", "'", '---', 'b'].join('\n'));
  assert.equal(stray.ok, false);
  assert.equal(stray.code, 'malformed_yaml');
  assert.ok(stray.reason.length > 0, 'a failure always carries a reason (REQ-037)');
});
