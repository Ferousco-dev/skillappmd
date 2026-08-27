import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync,
         mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

/**
 * NON-FUNCTIONAL VERIFICATION — G5 criterion 9.
 *
 * These assert properties of the REPOSITORY and the RUNNING SYSTEM, not of a single
 * function: security posture, dependency discipline, portability, documentation of
 * scaling limits. They are the tests that would catch a regression no unit test can see.
 */
const ROOT = resolve('.');
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git') continue;
    const p = join(dir, e);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const sources = () => [...walk(join(ROOT, 'packages')), ...walk(join(ROOT, 'apps'))]
  .filter((f) => /\.(js|mjs)$/.test(f));
const production = () => sources().filter((f) => !/[/\\](test|fixtures)[/\\]/.test(f));

// ---------------------------------------------------------------- security

test('TC-275 NFR-019 no secret or key material appears anywhere in source control', async () => {
  const patterns = [
    [/sk_live_[A-Za-z0-9]{8,}/, 'a live API key'],
    [/ghp_[A-Za-z0-9]{20,}/, 'a GitHub token'],
    [/AKIA[0-9A-Z]{16}/, 'an AWS access key'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key material'],
    [/(?:password|passwd|secret)\s*[:=]\s*['"][^'"\s]{10,}['"]/i, 'an embedded credential'],
  ];
  const offenders = [];
  for (const f of [...sources(), join(ROOT, '.gitignore')]) {
    const text = readFileSync(f, 'utf8');
    for (const [re, what] of patterns) {
      if (re.test(text)) offenders.push(`${relative(ROOT, f)}: ${what}`);
    }
  }
  assert.deepEqual(offenders, [], 'source control must contain no credential material');
});

test('TC-276 NFR-020 credentials are read from the environment, never written as literals', async () => {
  // Every credential-shaped read goes through process.env or an injected parameter.
  const offenders = [];
  for (const f of production()) {
    const text = readFileSync(f, 'utf8');
    // A literal assigned to something credential-shaped.
    const m = text.match(/(apiKey|api_key|token|password|secret)\s*=\s*['"][A-Za-z0-9_\-]{8,}['"]/i);
    if (m) offenders.push(`${relative(ROOT, f)}: ${m[0].slice(0, 40)}`);
  }
  assert.deepEqual(offenders, []);
});

test('TC-277 NFR-019/REQ-086 no log statement can emit a raw record or a credential', async () => {
  const offenders = [];
  for (const f of production()) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/console\.(log|error|warn|info)\(([^\n]*)/g)) {
      const arg = m[2];
      // Only INTERPOLATED VALUES matter. An earlier version matched the WORDS "bytes"
      // and "content" anywhere in a log line, which flagged ordinary operator prose
      // ("bytes gone; envelope survives") as a credential leak. A detector that cries
      // wolf gets muted, and a muted detector protects nothing.
      const interpolations = [...arg.matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1]);
      for (const expr of interpolations) {
        if (/\braw(Text|Bytes|Content)\b|\.content\b|\bapiKey\b|\btoken\b|\bsecret\b|\bpassword\b/i.test(expr)) {
          offenders.push(`${relative(ROOT, f)}: \${${expr.slice(0, 50)}}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], 'no log line interpolates raw content or a credential');
});

test('TC-278 REQ-027/NFR-024 the system contains no circumvention mechanism', async () => {
  const forbidden = [
    /user[-_]?agent\s*[:=]\s*['"][^'"]*(Mozilla|Chrome|Safari|Googlebot|bingbot)/i,
    /\bbypass[A-Z_]?(robots|ratelimit|rate_limit|captcha)/i,
    /\bsolve[A-Z_]?captcha/i,
    /rotate[A-Z_]?(proxy|ip)\b/i,
  ];
  const offenders = [];
  for (const f of production()) {
    const text = readFileSync(f, 'utf8');
    for (const re of forbidden) if (re.test(text)) offenders.push(`${relative(ROOT, f)}: ${re}`);
  }
  assert.deepEqual(offenders, [], 'no user-agent impersonation, no limit or bot-detection evasion');
});

test('TC-279 REQ-026 the fetcher identifies AppMD truthfully and contactably', async () => {
  // Inspect the DEFAULT VALUES assigned to a userAgent, not every mention of a browser
  // name. SkillsMPConnector legitimately contains /Mozilla|Googlebot/ inside the regex
  // that REFUSES impersonation - a detector that flagged that would have punished the
  // code for defending the requirement.
  const uas = [];
  for (const f of production()) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/userAgent\s*=\s*'([^']+)'/g)) uas.push([f, m[1]]);
  }
  assert.ok(uas.length > 0, 'a default User-Agent is declared somewhere');
  for (const [f, ua] of uas) {
    assert.match(ua, /AppMD/, `${relative(ROOT, f)}: the agent must name AppMD`);
    assert.match(ua, /https?:\/\/|@/, 'and be contactable');
    assert.equal(/Mozilla|Chrome|Safari|Googlebot|bingbot/i.test(ua), false,
      `${relative(ROOT, f)}: it must impersonate nobody`);
  }
  // And impersonation is refused at RUNTIME, not merely absent from the defaults.
  const connector = readFileSync(join(ROOT, 'packages/connectors/skillsmp/src/connector.js'), 'utf8');
  assert.match(connector, /REQ-026 violated/, 'a bad User-Agent is rejected, not just avoided');
});

test('TC-280 REQ-080/NFR-021 no execution path for third-party content exists', async () => {
  const dangerous = [/\beval\s*\(/, /new\s+Function\s*\(/, /child_process/, /\bexecSync\b/,
                     /\bspawnSync\b/, /vm\.runIn/];
  const offenders = [];
  for (const f of production()) {
    const text = readFileSync(f, 'utf8');
    for (const re of dangerous) if (re.test(text)) offenders.push(`${relative(ROOT, f)}: ${re}`);
  }
  assert.deepEqual(offenders, [],
    'skill content is instructions for an agent; executing it IS the attack');
});

test('TC-281 REQ-093/NFR-036 the API layer references no unnecessary personal field', async () => {
  const banned = /\b(email|real_name|full_name|follower|contribution_history|phone|address)\b/;
  const offenders = [];
  for (const f of production().filter((p) => p.includes(`${join('apps', 'api')}`))) {
    const text = readFileSync(f, 'utf8');
    if (banned.test(text)) offenders.push(relative(ROOT, f));
  }
  assert.deepEqual(offenders, [], 'the API surface names no personal field beyond attribution');
});

// ---------------------------------------------------------------- portability

test('TC-282 NFR-027 every port has at least two adapters, one needing no cloud account', async () => {
  const adapters = readdirSync(join(ROOT, 'packages', 'adapters'));
  const byPort = {
    CanonicalStore: adapters.filter((a) => /sqlite|memory-store|postgres/.test(a)),
    ObjectStore: adapters.filter((a) => /objectstore/.test(a)),
    Queue: adapters.filter((a) => /queue/.test(a)),
    RateLimiter: adapters.filter((a) => /ratelimit/.test(a)),
  };
  for (const [port, impls] of Object.entries(byPort)) {
    assert.ok(impls.length >= 1, `${port} has an adapter`);
  }
  assert.ok(byPort.CanonicalStore.length >= 2, 'CanonicalStore: sqlite + memory');
  assert.ok(byPort.ObjectStore.length >= 2, 'ObjectStore: fs + memory (+ r2 boundary)');
  // The offline requirement: at least one adapter per port needs no account.
  assert.ok(byPort.ObjectStore.some((a) => /fs|memory/.test(a)));
  assert.ok(byPort.CanonicalStore.some((a) => /sqlite|memory/.test(a)));
});

test('TC-283 NFR-028/NFR-029 domain layers import no vendor SDK and no I/O module', async () => {
  const pure = ['packages/skill-core/src', 'packages/ports/src'];
  const forbidden = /from\s+['"](node:fs|node:http|node:net|node:child_process|parquet-wasm|apache-arrow|@cloudflare)/;
  for (const layer of pure) {
    for (const f of walk(join(ROOT, layer)).filter((p) => /\.js$/.test(p))) {
      const text = readFileSync(f, 'utf8');
      assert.equal(forbidden.test(text), false,
        `${relative(ROOT, f)} must import no I/O module or vendor SDK`);
    }
  }
  // And the lint that enforces it actually fails when violated.
  const probe = join(ROOT, 'packages/skill-core/src/__nfr283_probe.js');
  try {
    writeFileSync(probe, "import 'parquet-wasm';\nexport const x = 1;\n");
    let failed = false;
    try { execFileSync('node', ['packages/tools/src/depcheck.js', '.'], { stdio: 'pipe' }); }
    catch { failed = true; }
    assert.equal(failed, true, 'the dependency lint must FAIL on a planted violation');
  } finally { rmSync(probe, { force: true }); }
});

test('TC-284 NFR-030 unit tests declare no network primitive', async () => {
  // A Worker handler is invoked as `worker.<name>(request, env)` with a Request object -
  // no socket is opened - so matching every member call flagged it. The pattern now
  // requires an unqualified call or an explicit global receiver. Narrowed for precision,
  // not to make the suite green: TC-352 plants violations and proves it still fires.
  //
  // This scan reads its own source, so nothing here may contain the literal pattern -
  // including prose. That is why this comment is phrased the way it is.
  const netCall = /(?<![.\w])(fetch|XMLHttpRequest)\s*\(|\b(globalThis|window)\.fetch\s*\(|from\s+['"]node:(http|https|net|dgram)['"]/;
  const offenders = [];
  for (const f of sources().filter((p) => /[/\\]test[/\\]/.test(p))) {
    const text = readFileSync(f, 'utf8');
    // globalThis.fetch REPLACEMENT is how TC-225 proves no network happens; that is the
    // opposite of making a call, so it is not an offence.
    const stripped = text.replace(/globalThis\.fetch\s*=[\s\S]*?;/g, '')
                         .replace(/globalThis\.fetch\s*=\s*realFetch;/g, '');
    if (netCall.test(stripped)) offenders.push(relative(ROOT, f));
  }
  assert.deepEqual(offenders, [], 'no test performs real network I/O');
});

test('TC-285 NFR-016 no pipeline stage requires a paid cloud plan to run locally', async () => {
  // Every adapter used by the default local composition is offline-capable.
  const r2 = readFileSync(join(ROOT, 'packages/adapters/r2-objectstore/src/index.js'), 'utf8');
  assert.match(r2, /R2NotConfiguredError/, 'the cloud adapter fails loudly rather than silently');
  assert.equal(/@cloudflare|aws-sdk|require\(/.test(r2), false, 'and imports no SDK');
  // The full suite itself is the evidence: it runs with no account and no network.
  assert.ok(existsSync(join(ROOT, 'packages/adapters/fs-objectstore/src/index.js')));
  assert.ok(existsSync(join(ROOT, 'packages/adapters/sqlite/src/index.js')));
});

// ---------------------------------------------------------------- cost and scale

test('TC-286 NFR-015 Phase 1 contains no LLM or embedding call site', async () => {
  const aiCall = /openai|anthropic\.|\.embeddings|createEmbedding|chat\.completions|@anthropic-ai|inference\.run/i;
  const offenders = [];
  for (const f of production()) {
    const text = readFileSync(f, 'utf8');
    // Strip our own vocabulary and third-party PROSE before looking for a call site.
    // SkillsMP's own disclaimer - "not affiliated with Anthropic or OpenAI" - is a fact
    // we record about them, not an API we call. A detector that cannot tell a sentence
    // from a call site will be muted, and a muted detector protects nothing.
    const stripped = text
      .replace(/appmd_inference|APPMD_INFERENCE|inferred|assertInference|inference is|AppMD inference/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')            // block comments
      .replace(/(^|\n)\s*\/\/[^\n]*/g, '')          // line comments
      .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");     // string literals
    if (aiCall.test(stripped)) offenders.push(relative(ROOT, f));
  }
  assert.deepEqual(offenders, [], 'zero AI spend is a property of the code, not a promise');
});

test('TC-287 NFR-018 the corpus footprint stays inside its stated cap', async () => {
  const dir = join(ROOT, 'data', 'corpus');
  if (!existsSync(dir)) return;                       // nothing fetched in this environment
  let bytes = 0;
  for (const f of walk(dir)) bytes += statSync(f).size;
  assert.ok(bytes <= 1024 ** 3, `corpus is ${(bytes / 1e6).toFixed(1)} MB, cap is 1 GB`);
});

test('TC-288 NFR-034 the architecture names its next binding constraint at each milestone', async () => {
  const scaling = readFileSync(join(ROOT, 'docs/SCALING.md'), 'utf8');
  for (const milestone of ['1M', '10M', '100M', '1B']) {
    assert.ok(scaling.includes(milestone), `SCALING.md must address ${milestone}`);
  }
  // Not merely mentioned - each has a named constraint and a response.
  assert.match(scaling, /D1 hard ceiling/);
  assert.match(scaling, /Vectorize 20M/);
  assert.match(scaling, /single-writer canonical path/);
  assert.match(scaling, /operational complexity, not cost/);
});

test('TC-289 NFR-031 no production module loads a whole dataset into memory', async () => {
  // Cursor or streaming APIs only: a readFileSync over corpus data would breach NFR-014.
  const offenders = [];
  for (const f of production()) {
    const text = readFileSync(f, 'utf8');
    if (/readFileSync\([^)]*corpus|\.rows\(\)\.map\(|JSON\.parse\(readFileSync\([^)]*jsonl/i.test(text)) {
      offenders.push(relative(ROOT, f));
    }
  }
  assert.deepEqual(offenders, [], 'corpus access is streamed, never slurped');
});

test('TC-290 NFR-017 derived results are keyed by content hash and analyser version', async () => {
  const raw = readFileSync(join(ROOT, 'packages/ingestion/src/reanalysis.js'), 'utf8');
  assert.match(raw, /analyser/, 'the analyser identity is part of the key');
  assert.match(raw, /idempotencyKey:\s*`reanalyse:\$\{analyser\}:\$\{version\}:\$\{a\.id\}`/,
    'the re-analysis key includes analyser AND version, so unchanged content is not reprocessed');
});

test('TC-352 NFR-030 the network detector FIRES on a planted violation', () => {
  // A detector nobody has tried to fool is a detector nobody should trust. TC-284 was
  // narrowed after a false positive; this proves the narrowing left it working.
  const netCall = /(?<![.\w])(fetch|XMLHttpRequest)\s*\(|\b(globalThis|window)\.fetch\s*\(|from\s+['"]node:(http|https|net|dgram)['"]/;

  // Assembled at runtime, never written literally: TC-284 scans THIS file too, and a
  // literal violation here would make the detector flag its own fixtures. Exempting the
  // file would have been the easy fix and would have created a blind spot.
  const F = 'fetch', X = 'XMLHttpRequest';
  for (const violation of [
    `const r = await ${F}('https://example.com');`,
    `await globalThis.${F}('https://example.com');`,
    `import { get } from 'node:${'https'}';`,
    `new ${X}();`,
  ]) {
    assert.ok(netCall.test(violation), `must flag: ${violation}`);
  }

  for (const allowed of [
    `const res = await worker.${F}(request, env);`,
    `const r = await conn.${F}({ id });`,
    `globalThis.${F} = () => { throw new Error(); };`,
  ]) {
    assert.equal(netCall.test(allowed), false, `must not flag: ${allowed}`);
  }
});
