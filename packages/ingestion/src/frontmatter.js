/**
 * Deliberately restricted YAML subset parser. DES-023, DES-045.
 * REQ-035, REQ-037, NFR-021, NFR-022.
 *
 * This is NOT a general YAML parser and must never become one. Third-party skill
 * content is untrusted input (NFR-021), and the features that make YAML dangerous -
 * anchors and aliases (the billion-laughs vector), custom tags, and merge keys -
 * are REJECTED rather than implemented. A smaller grammar is a smaller attack surface.
 *
 * Supported: `key: scalar`, block lists (`- item`), inline lists (`[a, b]`),
 * quoted strings, nested maps by indentation, comments, `---` fences.
 */

export const LIMITS = Object.freeze({
  MAX_BYTES: 256 * 1024,     // frontmatter far beyond any legitimate SKILL.md
  MAX_LINES: 2_000,
  MAX_DEPTH: 8,
  MAX_KEYS: 500,
  MAX_SCALAR: 8 * 1024,
});

export class FrontmatterError extends Error {
  constructor(reason, line = null) { super(reason); this.name = 'FrontmatterError'; this.line = line; }
}

const DANGEROUS = [
  [/(^|\s)[&*][A-Za-z0-9_-]+/, 'YAML anchors and aliases are rejected (expansion-attack vector)'],
  [/(^|\s)!!?[A-Za-z]/, 'YAML tags are rejected'],
  [/^\s*<<\s*:/m, 'YAML merge keys are rejected'],
];

/** Splits a SKILL.md into frontmatter text and body. Never throws on shape alone. */
export function splitDocument(text) {
  if (typeof text !== 'string') throw new FrontmatterError('content is not text');
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!src.startsWith('---')) return { frontmatterText: null, body: src, hadFence: false };

  const lines = src.split('\n');
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^(---|\.\.\.)\s*$/.test(lines[i])) { end = i; break; }
  }
  if (end === -1) return { frontmatterText: null, body: src, hadFence: true, unterminated: true };
  return { frontmatterText: lines.slice(1, end).join('\n'),
           body: lines.slice(end + 1).join('\n'), hadFence: true };
}

export function parseFrontmatter(fmText) {
  if (fmText === null) return {};
  if (Buffer.byteLength(fmText, 'utf8') > LIMITS.MAX_BYTES) {
    throw new FrontmatterError(`frontmatter exceeds ${LIMITS.MAX_BYTES} bytes`);
  }
  for (const [re, why] of DANGEROUS) if (re.test(fmText)) throw new FrontmatterError(why);

  const lines = fmText.split('\n');
  if (lines.length > LIMITS.MAX_LINES) throw new FrontmatterError(`frontmatter exceeds ${LIMITS.MAX_LINES} lines`);

  const root = {};
  // stack of { indent, container }
  const stack = [{ indent: -1, container: root }];
  let keyCount = 0;
  let pendingListKey = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*(#.*)?$/.test(raw)) continue;                       // blank or comment
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    if (stack.length > LIMITS.MAX_DEPTH) throw new FrontmatterError(`nesting deeper than ${LIMITS.MAX_DEPTH}`, i + 1);
    const parent = stack.at(-1).container;

    if (line.startsWith('- ') || line === '-') {                 // block list item
      const key = pendingListKey;
      if (key === null) throw new FrontmatterError('list item outside a key', i + 1);
      if (!Array.isArray(parent[key])) parent[key] = [];
      parent[key].push(coerce(line === '-' ? '' : line.slice(2).trim(), i + 1));
      continue;
    }

    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (!m) throw new FrontmatterError(`line is not a key/value pair: ${truncate(line)}`, i + 1);
    if (++keyCount > LIMITS.MAX_KEYS) throw new FrontmatterError(`more than ${LIMITS.MAX_KEYS} keys`, i + 1);

    const key = stripQuotes(m[1].trim());
    const rest = m[2].trim();
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new FrontmatterError(`unsafe key name: ${key}`, i + 1);   // prototype-pollution guard
    }

    // Block scalars: `key: |`, `key: >`, with optional chomping `-` / `+`.
    // DEF-002: these are extremely common in SKILL.md because descriptions are long,
    // and omitting them made the parser reject 4 of 43 real documents.
    const blockMatch = /^([|>])([-+]?)$/.exec(rest);
    if (blockMatch) {
      const [, style, chomp] = blockMatch;
      const { text, consumed } = readBlockScalar(lines, i + 1, indent);
      parent[key] = foldBlock(text, style, chomp);
      i += consumed;
      pendingListKey = null;
      continue;
    }

    if (rest === '') {
      const next = lines.slice(i + 1).find((l) => !/^\s*(#.*)?$/.test(l));
      const nextIndent = next ? next.length - next.trimStart().length : -1;
      if (next && next.trim().startsWith('-')) { parent[key] = []; pendingListKey = key; }
      else if (next && nextIndent > indent && !/^[^:]+:/.test(next.trim())) {
        // A plain multi-line scalar: `description:` followed by indented prose with
        // no key of its own. Also common, and also previously rejected (DEF-002).
        const { text, consumed } = readBlockScalar(lines, i + 1, indent);
        parent[key] = foldBlock(text, '>', '');
        i += consumed;
        pendingListKey = null;
      }
      else { const child = {}; parent[key] = child; stack.push({ indent, container: child }); pendingListKey = null; }
    } else {
      parent[key] = coerce(rest, i + 1);
      pendingListKey = null;
    }
  }
  return root;
}

/** Collects the indented lines belonging to a block scalar. Bounded like everything else. */
function readBlockScalar(lines, start, parentIndent) {
  const collected = [];
  let i = start;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '') { collected.push(''); continue; }
    const ind = l.length - l.trimStart().length;
    if (ind <= parentIndent) break;
    collected.push(l.slice(parentIndent + 1));
    if (collected.length > LIMITS.MAX_LINES) throw new FrontmatterError('block scalar too long', i + 1);
  }
  while (collected.length && collected.at(-1) === '') collected.pop();
  const text = collected.join('\n');
  if (Buffer.byteLength(text, 'utf8') > LIMITS.MAX_SCALAR) {
    throw new FrontmatterError('scalar too large', start);
  }
  return { text, consumed: i - start };
}

/** `|` keeps newlines; `>` folds them to spaces. Chomping affects the trailing newline only. */
function foldBlock(text, style, chomp) {
  const dedented = text.split('\n').map((l) => l.replace(/^\s+/, (m) => m.slice(Math.min(m.length, 0)))).join('\n');
  let out = style === '>'
    ? dedented.split(/\n{2,}/).map((para) => para.split('\n').map((l) => l.trim()).join(' ')).join('\n\n')
    : dedented.split('\n').map((l) => l.replace(/^ {0,4}/, '')).join('\n');
  out = out.trim();
  if (chomp === '+') out += '\n';
  return out;
}

function coerce(v, line) {
  if (Buffer.byteLength(v, 'utf8') > LIMITS.MAX_SCALAR) throw new FrontmatterError('scalar too large', line);
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((x) => coerce(x.trim(), line));
  }
  const unq = stripQuotes(v);
  if (unq !== v) return unq;                       // it was quoted: keep as string
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) { const n = Number(v); return Number.isSafeInteger(n) ? n : v; }
  return v;
}

const stripQuotes = (s) =>
  (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'")))
    ? s.slice(1, -1) : s;

const truncate = (s, n = 60) => (s.length > n ? s.slice(0, n) + '…' : s);
