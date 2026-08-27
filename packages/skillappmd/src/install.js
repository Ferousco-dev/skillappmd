/**
 * Installer for the resolver skill. REQ-100, REQ-101, REQ-104.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It downloads nothing. `init` copies one file
 * that ships inside the package and makes no network request at all — REQ-104 exists
 * because "install the index" is the obvious wrong reading of what this product is, and
 * an installer that quietly pulled 3.8M records would be that wrong reading made real.
 *
 * The only verified layout is Claude Code's `~/.claude/skills/<name>/SKILL.md`, confirmed
 * against a real installation. Other agents are reachable through `--dir` rather than
 * through a guess: writing a skill into a path we invented would fail silently, which is
 * the worst way for an installer to fail.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const SKILL_NAME = 'skillappmd';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE_SKILL = join(PACKAGE_ROOT, 'skill', 'SKILL.md');

/**
 * @param {{home?: string, cwd?: string, project?: boolean, dir?: string|null}} opts
 * @returns {{path: string, scope: 'project'|'user'|'explicit'}}
 */
export function resolveTarget({ home = homedir(), cwd = process.cwd(), project = false, dir = null } = {}) {
  if (dir) return { path: join(resolve(cwd, dir), SKILL_NAME, 'SKILL.md'), scope: 'explicit' };
  const base = project ? join(cwd, '.claude', 'skills') : join(home, '.claude', 'skills');
  return { path: join(base, SKILL_NAME, 'SKILL.md'), scope: project ? 'project' : 'user' };
}

/**
 * REQ-101: never overwrite without --force, and always report the exact path written.
 * An installer that reports "done" without saying where is one the user cannot undo.
 */
export function install({ home, cwd, project = false, dir = null, force = false, source = SOURCE_SKILL } = {}) {
  const target = resolveTarget({ home, cwd, project, dir });
  const existed = existsSync(target.path);

  if (existed && !force) {
    return { ...target, written: false, existed, reason: 'already installed; pass --force to replace' };
  }

  const body = readFileSync(source, 'utf8');
  if (!/^---\r?\nname: skillappmd\r?\n/.test(body)) {
    // The frontmatter `name` is how the agent addresses the skill. If it drifts, the
    // install succeeds and the skill is simply never found - a silent failure.
    throw new Error('refusing to install: skill frontmatter does not declare name: skillappmd');
  }

  mkdirSync(dirname(target.path), { recursive: true });
  writeFileSync(target.path, body);
  return { ...target, written: true, existed, bytes: Buffer.byteLength(body), reason: existed ? 'replaced' : 'installed' };
}

/** The base the resolver will talk to. REQ-105: overridable so this is testable locally. */
export const apiBase = (env = process.env) => env.APPMD_API || 'https://api.skillappmd.dev';
