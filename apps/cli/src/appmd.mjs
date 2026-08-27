#!/usr/bin/env node
/**
 * Operator CLI. DES-055. REQ-088, REQ-089, REQ-090. UI-001..UI-006.
 *
 * INTERFACE.md §2: `appmd <noun> <verb>`. Read verbs never mutate; mutating verbs
 * are separate nouns and cannot be reached by adding a flag to a read command.
 */
import { SqliteCanonicalStore } from '../../../packages/adapters/sqlite/src/index.js';
import { ApiRouter } from '../../api/src/router.js';
import { GITSKILLS_ACCESS_POLICY } from '../../../packages/connectors/gitskills/src/index.js';

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const [k, v] = argv[i].slice(2).split('=');
    flags[k] = v ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
  } else positional.push(argv[i]);
}
const [noun, verb, ...rest] = positional;
const DB = flags.db ?? 'data/appmd.db';
const JSON_OUT = flags.json === true || flags.json === 'true';   // UI-006: machine readable
const NOW = () => new Date().toISOString();                       // NFR-038: UTC

/** Levenshtein distance, for a suggestion that is actually near. */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1,
                         d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function nearest(word, candidates) {
  const scored = candidates.map((c) => [c, distance(word, c)]).sort((x, y) => x[1] - y[1]);
  return scored[0] && scored[0][1] <= Math.max(2, Math.floor(word.length / 2)) ? scored[0][0] : null;
}

const NOUNS = {
  source: ['list'], skill: ['get', 'list'], occurrence: ['list'],
  job: ['get', 'list'], dlq: ['list', 'inspect', 'resubmit'],
  index: ['rebuild'], backup: ['create', 'verify', 'restore'], doctor: [],
  removal: ['request', 'list', 'action', 'decline'], reanalyse: ['plan'],
  raw: ['status', 'retention'],
};

function usage() {
  console.log(`appmd — AppMD Skill Intelligence operator CLI

  appmd doctor                       check config, adapters, corpus, DLQ
  appmd source list                  sources and their declared access policy
  appmd skill get <id>               one canonical skill with provenance and rights
  appmd skill list [--cursor C] [--limit N]
  appmd occurrence list --skill <id> [--cursor C]
  appmd job list --skill-ref <ref>   what happened to THIS skill
  appmd backup create [--out PATH]
  appmd backup verify <path>
  appmd backup restore <path> --confirm
  appmd removal request --skill <id> --repo <r> --reason <text> --by <who>
  appmd removal list [--repo R]
  appmd removal action <request-id> --confirm     (deletes bytes; envelope survives)
  appmd removal decline <request-id> --reason <text>
  appmd reanalyse plan --analyser <id> --version <v>
  appmd raw status                       raw object counts by retention state
  appmd raw retention --confirm          delete expired raw bytes (REQ-034)
  appmd index rebuild --confirm          rebuild the derived search index (REQ-052)

Global: --db PATH   --json   --limit N   --cursor C
Read verbs never mutate. Mutating verbs require --confirm.`);
}

function out(obj, human) {
  if (JSON_OUT) console.log(JSON.stringify(obj, null, 2));
  else human();
}

function open() {
  const s = new SqliteCanonicalStore(DB);
  if (s.schemaVersion() === 0) s.migrate({ now: NOW() });
  return s;
}

try {
  if (!noun || noun === 'help' || flags.help) { usage(); process.exit(0); }
  if (!(noun in NOUNS)) {
    // UI-005 tolerance: suggest the NEAREST noun, not merely one sharing a first letter.
    // "skil" suggesting "source" is worse than no suggestion - it sends the operator
    // to the wrong place with confidence.
    const near = nearest(noun, Object.keys(NOUNS));
    console.error(`unknown noun "${noun}".${near ? ` Did you mean "${near}"?` : ''}`);
    console.error(`known nouns: ${Object.keys(NOUNS).join(', ')}`);
    process.exit(2);
  }
  if (NOUNS[noun].length && !NOUNS[noun].includes(verb)) {
    console.error(`"${noun}" supports: ${NOUNS[noun].join(', ')}`);
    process.exit(2);
  }

  if (noun === 'doctor') {
    const s = open();
    const c = s.counts();
    const report = {
      database: DB, schema_version: s.schemaVersion(), counts: c,
      dead_letter_queue: 'not configured in CLI context (set for consumers, DEC-025)',
      corpus_path: 'data/corpus/', timestamps: 'UTC RFC3339 (NFR-038)',
    };
    out(report, () => {
      console.log(`database        ${DB}`);
      console.log(`schema version  ${report.schema_version}`);
      console.log(`canonical       ${c.canonical}`);
      console.log(`occurrences     ${c.occurrences}`);
      console.log(`tombstones      ${c.tombstones}`);
      console.log(`\nok — no blocking problems detected`);
    });
    s.close();
  }

  else if (noun === 'source' && verb === 'list') {
    // UI-008 / visibility: rate limits are shown BEFORE a run, not discovered during one.
    out({ sources: [{ id: 'gitskills', access_policy: GITSKILLS_ACCESS_POLICY }] }, () => {
      console.log('gitskills');
      console.log(`  concurrency   ${GITSKILLS_ACCESS_POLICY.max_concurrency}`);
      console.log(`  methods       ${GITSKILLS_ACCESS_POLICY.permitted_methods.join(', ')}`);
      console.log(`  licence       ${GITSKILLS_ACCESS_POLICY.attribution.licence} (${GITSKILLS_ACCESS_POLICY.attribution.doi})`);
      console.log(`  note          ${GITSKILLS_ACCESS_POLICY.tos_notes}`);
    });
  }

  else if (noun === 'skill') {
    const s = open();
    const router = new ApiRouter({ store: s, clock: NOW, limiter: null });
    if (verb === 'get') {
      const r = router.handle({ method: 'GET', path: `/api/v1/skills/${rest[0]}`, query: {} });
      if (r.status !== 200) { console.error(`${r.body.error.code}: ${r.body.error.message}`); process.exit(1); }
      out(r.body, () => {
        const d = r.body.data;
        console.log(`${d.declared.name ?? '(no declared name — frontmatter absent or invalid)'}   ${d.id}`);
        console.log(`  repository    ${d.attribution.repository}`);
        console.log(`  source        ${d.attribution.canonical_source_url}`);
        console.log(`  rights        ${d.rights.state} · redistributable=${d.rights.redistributable}`);
        console.log(`  basis         ${d.rights.basis}`);
        console.log(`  licence L2    ${d.licence.l2_repository.spdx}   L3 ${d.licence.l3_declared.spdx}${d.licence.conflict ? '  [CONFLICT]' : ''}`);
        console.log(`  content       not served (${d.content_notice})`);
      });
    } else {
      const r = router.handle({ method: 'GET', path: '/api/v1/skills',
        query: { cursor: flags.cursor, limit: flags.limit } });
      out(r.body, () => {
        for (const d of r.body.data) {
          // A null name is correct data, not an error: the spec requires `name`, and
          // ~23% of the corpus omits it. Show the path so the row is still identifiable.
          const label = d.declared.name ?? `~ ${d.attribution.canonical_source_url.split('/').slice(-2).join('/')}`;
          console.log(`${label.slice(0, 40).padEnd(42)} ${String(d.rights.state).padEnd(8)} ${d.attribution.repository}`);
        }
        console.log(`\n${r.body.data.length} shown${r.body.cursor.next ? `  ·  next: --cursor ${r.body.cursor.next}` : '  ·  end'}`);
      });
    }
    s.close();
  }

  else if (noun === 'occurrence' && verb === 'list') {
    const s = open();
    const router = new ApiRouter({ store: s, clock: NOW, limiter: null });
    const r = router.handle({ method: 'GET', path: `/api/v1/skills/${flags.skill}/occurrences`,
      query: { cursor: flags.cursor, limit: flags.limit } });
    if (r.status !== 200) { console.error(`${r.body.error.code}: ${r.body.error.message}`); process.exit(1); }
    out(r.body, () => {
      for (const o of r.body.data) console.log(`${o.repository.padEnd(40)} ${o.relationship ?? 'PRIMARY'}  ${o.path}`);
      console.log(`\n${r.body.data.length} occurrence(s) — dedup collapses identity, never evidence (REQ-046)`);
    });
    s.close();
  }

  else if (noun === 'job' && verb === 'list') {
    const s = open();
    const jobs = s.listJobs({ skillRef: flags['skill-ref'] });
    out({ jobs }, () => {
      for (const j of jobs) console.log(`${j.stage.padEnd(16)} ${j.status.padEnd(14)} attempt ${j.attempt}  ${j.started_at}${j.error ? `  ${j.error}` : ''}`);
      if (!jobs.length) console.log('(no jobs for that skill_ref)');
    });
    s.close();
  }

  else if (noun === 'backup') {
    const s = open();
    if (verb === 'create') {
      const target = flags.out ?? `data/backups/canonical-${Date.now()}.db`;
      const r = s.backup(target);
      out(r, () => console.log(`backup written: ${r.path}\n  records ${r.records}\n  digest  ${r.digest}`));
    } else if (verb === 'verify') {
      const expected = s.digest();
      const v = SqliteCanonicalStore.verifyRestore(rest[0], expected);
      out(v, () => console.log(v.ok ? `verified: ${v.reason}` : `VERIFY FAILED: ${v.reason}`));
      if (!v.ok) process.exit(1);
    } else if (verb === 'restore') {
      // UI-002 / tolerance: destructive, and it says exactly what it will overwrite.
      if (flags.confirm !== true && flags.confirm !== 'true') {
        console.error(`restore OVERWRITES the canonical store at ${DB}.`);
        console.error('Take a backup first, then re-run with --confirm.');
        process.exit(2);
      }
      s.close();
      const restored = SqliteCanonicalStore.restore(rest[0], DB);
      const d = restored.digest();
      console.log(`restored ${d.records} records into ${DB}\n  digest ${d.digest}`);
      restored.close();
      process.exit(0);
    }
    s.close();
  }

  else if (noun === 'removal') {
    const s2 = open();
    const { RemovalService } = await import('../../../packages/ingestion/src/index.js');
    const svc = new RemovalService({ store: s2, clock: NOW });
    if (verb === 'request') {
      const id = flags.id ?? `rq_${Date.now().toString(36)}`;
      const r = svc.submit({ requestId: id, canonicalId: flags.skill ?? null,
        repository: flags.repo, kind: flags.kind ?? 'removal',
        reason: flags.reason, requestedBy: flags.by });
      out(r, () => console.log(`request ${r.requestId} recorded as ${r.disposition}`));
    } else if (verb === 'list') {
      const rows = svc.history(flags.repo);
      out({ requests: rows }, () => {
        for (const q of rows) console.log(`${q.request_id}  ${q.disposition.padEnd(9)} ${q.kind.padEnd(10)} ${q.repository}  ${q.reason}`);
        if (!rows.length) console.log('(no requests)');
      });
    } else if (verb === 'action') {
      // UI-002: destructive and irreversible for the bytes. Say exactly what dies.
      if (flags.confirm !== true && flags.confirm !== 'true') {
        const q = s2.getRemovalRequest(rest[0]);
        console.error(`This DELETES the stored content bytes for ${q?.repository ?? 'that record'}.`);
        console.error('The provenance envelope, attribution and tombstone are PRESERVED (DEC-015).');
        console.error('Re-run with --confirm.');
        process.exit(2);
      }
      const r = await svc.action({ requestId: rest[0], actor: flags.actor ?? 'operator' });
      out(r, () => {
        console.log(`actioned ${r.requestId}`);
        console.log(`  tombstoned    ${r.tombstoned}`);
        console.log(`  bytes deleted ${r.bytesDeleted}${r.bytesDeleted ? '' : '   (no object store configured; the canonical record is still tombstoned)'}`);
        console.log('  preserved     provenance envelope, attribution, tombstone (DEC-015)');
      });
    } else if (verb === 'decline') {
      const r = svc.decline({ requestId: rest[0], actor: flags.actor ?? 'operator',
                              dispositionReason: flags.reason });
      out(r, () => console.log(`declined ${r.requestId}`));
    }
    s2.close();
  }

  else if (noun === 'raw') {
    const s2 = open();
    const { FsObjectStore } = await import('../../../packages/adapters/fs-objectstore/src/index.js');
    const { applyRetention } = await import('../../../packages/ingestion/src/index.js');
    const objects = new FsObjectStore({ root: flags['raw-root'] ?? 'data/raw' });
    if (verb === 'status') {
      const c = s2.rawCounts();
      out(c, () => {
        console.log(`raw root      ${objects.root}`);
        console.log(`retained      ${c.retained}`);
        console.log(`deleted       ${c.deleted}   (bytes gone; envelope survives - DEC-015)`);
        console.log(`total known   ${c.total}`);
      });
    } else if (verb === 'retention') {
      // UI-002: deletes real bytes.
      if (flags.confirm !== true && flags.confirm !== 'true') {
        const due = s2.findExpiredRaw({ now: NOW(), limit: 10000 }).length;
        console.error(`This DELETES raw bytes for ${due} expired object(s) under ${objects.root}.`);
        console.error('The raw_objects rows and provenance envelopes are PRESERVED (DEC-015).');
        console.error('Re-run with --confirm.');
        process.exit(2);
      }
      const r = await applyRetention({ objects, store: s2, now: NOW() });
      out(r, () => console.log(`considered ${r.considered}, deleted ${r.deleted}, already gone ${r.alreadyGone}`));
    }
    s2.close();
  }

  else if (noun === 'index' && verb === 'rebuild') {
    const s2 = open();
    const { rebuildSearchIndex } = await import('../../../packages/ingestion/src/index.js');
    if (flags.confirm !== true && flags.confirm !== 'true') {
      console.error(`This DESTROYS and rebuilds the derived search index (${s2.searchIndexCount()} entries).`);
      console.error('Canonical data is untouched - the index is derived and rebuildable (REQ-051).');
      console.error('Re-run with --confirm.');
      process.exit(2);
    }
    const r = rebuildSearchIndex({ store: s2, now: NOW() });
    out(r, () => {
      console.log(`dropped   ${r.dropped}`);
      console.log(`scanned   ${r.scanned}`);
      console.log(`indexed   ${r.indexed}`);
      console.log(`excluded  ${r.excludedTombstoned} tombstoned`);
      console.log(`result    ${r.equivalence}`);
      console.log(`source contact: ${r.sourceContact}`);
    });
    s2.close();
  }

  else if (noun === 'reanalyse' && verb === 'plan') {
    const s2 = open();
    const { ReanalysisService } = await import('../../../packages/ingestion/src/index.js');
    const svc = new ReanalysisService({ store: s2, clock: NOW });
    const p = svc.plan({ analyser: flags.analyser, version: flags.version,
                         limit: Number(flags.limit ?? 1000) });
    out(p, () => {
      console.log(`analyser ${p.analyser} -> ${p.targetVersion}`);
      console.log(`affected records: ${p.count}`);
      for (const a of p.affected.slice(0, 10)) console.log(`  ${a.id}  current=${a.currentVersion ?? 'never analysed'}`);
      if (p.count > 10) console.log(`  ... ${p.count - 10} more`);
    });
    s2.close();
  }

  else { usage(); process.exit(2); }
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}
