#!/usr/bin/env node
/**
 * `npx skillappmd@latest init` — REQ-100.
 *
 * Two commands and no configuration file. The whole point of the product is that the
 * agent does the work afterwards; the installer's only job is to put one file in the
 * right place and say where it went.
 */
import { install, resolveTarget, apiBase, SKILL_NAME } from './install.js';

const USAGE = `skillappmd — install the AppMD skill resolver into your coding agent

  npx skillappmd@latest init [options]

    --project     install into ./.claude/skills instead of your home directory
    --dir <path>  install into <path>/${SKILL_NAME}/SKILL.md (for agents other than Claude Code)
    --force       replace an existing installation
    --dry-run     show where it would go, write nothing

  npx skillappmd@latest where     print the install path and exit
  npx skillappmd@latest --help

This installs ONE file. It downloads no skills and no index: the resolver asks
${apiBase()} at the moment your agent needs something, and fetches
the skill itself from the repository that published it.
`;

function parse(argv) {
  const flags = { project: false, dir: null, force: false, dryRun: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') flags.project = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--dir') flags.dir = argv[++i] ?? null;
    else if (a === '--help' || a === '-h') flags.help = true;
    else rest.push(a);
  }
  return { command: rest[0], flags };
}

/**
 * `home` and `cwd` are injectable because a test that runs `init` against the real home
 * directory installs a skill on the developer's machine. That happened once during
 * construction and is why they are parameters rather than ambient state.
 */
export function run(argv = process.argv.slice(2),
                    { log = console.log, error = console.error, home, cwd } = {}) {
  const { command, flags: parsed } = parse(argv);
  const flags = { ...parsed, ...(home ? { home } : {}), ...(cwd ? { cwd } : {}) };

  if (flags.help || !command) { log(USAGE); return 0; }

  if (command === 'where') {
    log(resolveTarget(flags).path);
    return 0;
  }

  if (command !== 'init') {
    error(`unknown command: ${command}\n\nRun with --help to see what is available.`);
    return 1;
  }

  if (flags.dryRun) {
    const t = resolveTarget(flags);
    log(`would install to ${t.path}  (${t.scope} scope)\nnothing written — --dry-run`);
    return 0;
  }

  const r = install(flags);
  if (!r.written) {
    error(`${r.path}\n${r.reason}`);
    return 1;
  }

  log(`installed  ${r.path}`);
  log(`scope      ${r.scope}`);
  log(`api        ${apiBase()}`);
  log('');
  log('One file, no index. Restart your agent and it will consult AppMD when it needs');
  log('a capability it does not have.');
  return 0;
}

// Only self-execute as a binary, so the module stays importable by tests.
if (process.argv[1] && process.argv[1].endsWith('cli.js')) process.exitCode = run();
