/**
 * Deliberately restricted YAML subset parser. DES-023, DES-045.
 * REQ-035, REQ-036, REQ-037, NFR-021, NFR-022.
 *
 * NOT a general YAML parser, and it must never become one. Third-party skill content
 * is untrusted input, and the features that make YAML dangerous - anchors and aliases
 * (the billion-laughs vector), custom tags, merge keys - are REJECTED rather than
 * implemented. A smaller grammar is a smaller attack surface.
 *
 * Supported, because real SKILL.md files use all of it (measured, DEF-005):
 *   key: scalar                  quoted strings, ints, bools, null
 *   key: [a, b]                  inline lists
 *   key: >  >-  |  |-            block scalars, with chomping
 *   key: first line              plain scalars continuing on indented lines
 *     continued here
 *   key:                         nested maps
 *     nested: value
 *   key:                         block sequences, at OR below the parent indent
 *   - item
 *   - name: x                    sequences of maps
 *     description: y
 */

export const LIMITS = Object.freeze({
  MAX_BYTES: 256 * 1024,
  MAX_LINES: 2_000,
  MAX_DEPTH: 12,
  MAX_KEYS: 500,
  MAX_SCALAR: 8 * 1024,
});

export class FrontmatterError extends Error {
  constructor(reason, line = null) { super(reason); this.name = 'FrontmatterError'; this.line = line; }
}

/**
 * DEF-005: anchors and aliases occupy a VALUE position - `key: &a x`, `- *a`.
 * An earlier version matched any whitespace-preceded `&`/`*`, which rejected ordinary
 * markdown emphasis such as `*SummarizedExperiment*` in a description. A guard that
 * refuses legitimate documents is a defect that looks like a security win.
 */
function scanDangerous(lines) {
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (line === '') continue;
    if (/^<<\s*:/.test(line)) throw new FrontmatterError('YAML merge keys are rejected', i + 1);

    // The value is whatever follows `key:` or a `- ` sequence marker.
    const m = /^(?:-\s+)?(?:[^:\n]+:\s*)?(.*)$/.exec(line);
    const value = (m ? m[1] : '').trim();
    if (/^[&*][A-Za-z0-9_-]+\s*$/.test(value) || /^[&*][A-Za-z0-9_-]+\s/.test(value)) {
      throw new FrontmatterError('YAML anchors and aliases are rejected (expansion-attack vector)', i + 1);
    }
    if (/^!!?[A-Za-z]/.test(value)) throw new FrontmatterError('YAML tags are rejected', i + 1);
  }
}

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

const indentOf = (l) => l.length - l.trimStart().length;
const isBlank = (l) => /^\s*(#.*)?$/.test(l);

export function parseFrontmatter(fmText) {
  if (fmText === null) return {};
  if (Buffer.byteLength(fmText, 'utf8') > LIMITS.MAX_BYTES) {
    throw new FrontmatterError(`frontmatter exceeds ${LIMITS.MAX_BYTES} bytes`);
  }
  const lines = fmText.split('\n');
  if (lines.length > LIMITS.MAX_LINES) throw new FrontmatterError(`frontmatter exceeds ${LIMITS.MAX_LINES} lines`);
  scanDangerous(lines);

  const state = { lines, i: 0, keys: 0 };
  const root = parseMap(state, 0, 0);
  return root;
}

/** Parses a block map at `minIndent`. Returns when a line dedents past it. */
function parseMap(st, minIndent, depth) {
  if (depth > LIMITS.MAX_DEPTH) throw new FrontmatterError(`nesting deeper than ${LIMITS.MAX_DEPTH}`, st.i + 1);
  const out = {};
  while (st.i < st.lines.length) {
    const raw = st.lines[st.i];
    if (isBlank(raw)) { st.i++; continue; }
    const ind = indentOf(raw);
    if (ind < minIndent) break;

    const line = raw.trim();
    if (line.startsWith('- ') || line === '-') break;   // a sequence belongs to the caller

    const m = /^([^:]+):(.*)$/.exec(line);
    if (!m) throw new FrontmatterError(`line is not a key/value pair: ${truncate(line)}`, st.i + 1);
    if (++st.keys > LIMITS.MAX_KEYS) throw new FrontmatterError(`more than ${LIMITS.MAX_KEYS} keys`, st.i + 1);

    const key = stripQuotes(m[1].trim());
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new FrontmatterError(`unsafe key name: ${key}`, st.i + 1);
    }
    const rest = m[2].trim();
    st.i++;

    const block = /^([|>])([-+]?)$/.exec(rest);
    if (block) { out[key] = foldBlock(readIndented(st, ind), block[1], block[2]); continue; }

    if (rest === '') {
      const next = peek(st);
      if (next === null) { out[key] = null; continue; }
      const nInd = indentOf(next);
      if (next.trim().startsWith('-') && nInd >= ind) { out[key] = parseSeq(st, nInd, depth + 1); continue; }
      if (nInd > ind) {
        // A nested map, or a plain multi-line scalar with no key of its own.
        out[key] = /^[^:\n]+:/.test(next.trim())
          ? parseMap(st, nInd, depth + 1)
          : foldBlock(readIndented(st, ind), '>', '');
        continue;
      }
      out[key] = null;
      continue;
    }

    // A scalar that may continue on more-indented lines (very common for `description`).
    const cont = [];
    while (st.i < st.lines.length) {
      const l = st.lines[st.i];
      if (isBlank(l)) break;
      if (indentOf(l) <= ind) break;
      if (/^[^:\n]+:\s/.test(l.trim()) || /^[^:\n]+:$/.test(l.trim())) break;
      if (l.trim().startsWith('- ')) break;
      cont.push(l.trim());
      st.i++;
    }
    out[key] = cont.length ? coerce([rest, ...cont].join(' '), st.i) : coerce(rest, st.i);
  }
  return out;
}

/** Parses a block sequence whose items sit at `itemIndent`. */
function parseSeq(st, itemIndent, depth) {
  if (depth > LIMITS.MAX_DEPTH) throw new FrontmatterError(`nesting deeper than ${LIMITS.MAX_DEPTH}`, st.i + 1);
  const items = [];
  while (st.i < st.lines.length) {
    const raw = st.lines[st.i];
    if (isBlank(raw)) { st.i++; continue; }
    const ind = indentOf(raw);
    if (ind < itemIndent) break;
    const line = raw.trim();
    if (!line.startsWith('-')) break;

    const inline = line === '-' ? '' : line.slice(1).trim();
    st.i++;

    if (inline !== '' && /^[^:\n]+:/.test(inline)) {
      // `- name: x` followed by sibling keys indented under it: a sequence of maps.
      const first = /^([^:]+):(.*)$/.exec(inline);
      const obj = { [stripQuotes(first[1].trim())]: coerce(first[2].trim(), st.i) };
      const next = peek(st);
      if (next && indentOf(next) > ind && !next.trim().startsWith('-')) {
        Object.assign(obj, parseMap(st, indentOf(next), depth + 1));
      }
      items.push(obj);
    } else if (inline === '') {
      const next = peek(st);
      items.push(next && indentOf(next) > ind ? parseMap(st, indentOf(next), depth + 1) : null);
    } else {
      // A sequence item whose text wraps onto more-indented lines. Same shape as a
      // wrapped scalar under a key, and just as common in real descriptions.
      const cont = [];
      while (st.i < st.lines.length) {
        const l = st.lines[st.i];
        if (isBlank(l)) break;
        if (indentOf(l) <= ind) break;
        if (l.trim().startsWith('- ')) break;
        if (/^[^:\n]+:(\s|$)/.test(l.trim())) break;
        cont.push(l.trim());
        st.i++;
      }
      items.push(coerce(cont.length ? [inline, ...cont].join(' ') : inline, st.i));
    }
  }
  return items;
}

function peek(st) {
  for (let j = st.i; j < st.lines.length; j++) if (!isBlank(st.lines[j])) return st.lines[j];
  return null;
}

/** Collects lines more indented than `parentIndent`, for block and plain multi-line scalars. */
function readIndented(st, parentIndent) {
  const collected = [];
  while (st.i < st.lines.length) {
    const l = st.lines[st.i];
    if (l.trim() === '') { collected.push(''); st.i++; continue; }
    if (indentOf(l) <= parentIndent) break;
    collected.push(l.slice(parentIndent + 1));
    st.i++;
    if (collected.length > LIMITS.MAX_LINES) throw new FrontmatterError('block scalar too long', st.i);
  }
  while (collected.length && collected.at(-1) === '') collected.pop();
  const text = collected.join('\n');
  if (Buffer.byteLength(text, 'utf8') > LIMITS.MAX_SCALAR) throw new FrontmatterError('scalar too large', st.i);
  return text;
}

function foldBlock(text, style, chomp) {
  let out = style === '>'
    ? text.split(/\n{2,}/).map((p) => p.split('\n').map((l) => l.trim()).join(' ')).join('\n\n')
    : text.split('\n').map((l) => l.replace(/^ {0,4}/, '')).join('\n');
  out = out.trim();
  if (chomp === '+') out += '\n';
  return out;
}

function coerce(v, line) {
  if (Buffer.byteLength(String(v), 'utf8') > LIMITS.MAX_SCALAR) throw new FrontmatterError('scalar too large', line);
  const s = String(v);
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((x) => coerce(x.trim(), line));
  }
  const unq = stripQuotes(s);
  if (unq !== s) return unq;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) { const n = Number(s); return Number.isSafeInteger(n) ? n : s; }
  return s;
}

const stripQuotes = (s) =>
  (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'")))
    ? s.slice(1, -1) : s;

const truncate = (s, n = 60) => (s.length > n ? s.slice(0, n) + '...' : s);
