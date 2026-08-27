/**
 * Synthetic corpus fixtures. DES-071. NFR-030: offline, deterministic, no network.
 *
 * These deliberately REPRODUCE the corpus's real pathology measured in R3:
 * rows are ordered by body size, from ~10 bytes at offset 0 to ~19 KB at the end.
 * A fixture that did not reproduce it would let head-of-shard sampling pass,
 * which is precisely the bug DEC-024 exists to prevent.
 */

const LICENCES = ['MIT', 'Apache-2.0', 'GPL-3.0', null, 'ISC', 'unknown-custom'];

/** Deterministic pseudo-random so a re-run is byte-identical (NFR-001). */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 0x100000000);
}

export function syntheticCorpus({ rows = 1000, seed = 42 } = {}) {
  const rnd = lcg(seed);
  const out = [];
  // Duplicate pool: R3 measured ~50.2% dedup_primary, so ~half the rows repeat content.
  const pool = [];

  for (let i = 0; i < rows; i++) {
    // Size ordering: mirrors R3's measured 10 -> 19,352 byte progression.
    const frac = i / Math.max(1, rows - 1);
    const targetBody = Math.round(10 + frac * 19_000);
    const owner = `owner${i % 137}`;
    const repo = `${owner}/repo${i % 311}`;
    const isDup = i > 20 && rnd() < 0.498 && pool.length > 0;

    let content, fileSha, bodyChars, frontmatterValid;
    if (isDup) {
      const src = pool[Math.floor(rnd() * pool.length)];
      ({ content, fileSha, bodyChars, frontmatterValid } = src);
    } else {
      const valid = rnd() > 0.223;                       // R3: 77.4% frontmatter_valid
      const body = 'x'.repeat(Math.max(1, targetBody));
      content = valid
        ? `---\nname: skill-${i}\ndescription: Synthetic skill ${i} for offline tests.\n---\n${body}`
        : `no frontmatter here\n${body}`;
      fileSha = `sha1fixture${String(i).padStart(30, '0')}`;
      bodyChars = body.length;
      frontmatterValid = valid ? 1 : 0;
      pool.push({ content, fileSha, bodyChars, frontmatterValid });
      if (pool.length > 50) pool.shift();
    }

    out.push({
      repo_full_name: repo,
      path: i % 5 === 0 ? 'SKILL.md' : `skills/s${i % 17}/SKILL.md`,
      filename: 'SKILL.md',
      location_class: i % 5 === 0 ? 'canonical' : 'skills-dir',
      file_sha: fileSha,
      discovered_at: '2026-08-10T00:00:00Z',
      content,
      content_fetched: isDup ? 0 : 1,       // R3: content lives only on primaries
      frontmatter_valid: isDup ? 0 : frontmatterValid,
      name: frontmatterValid && !isDup ? `skill-${i}` : null,
      description: frontmatterValid && !isDup ? `Synthetic skill ${i}` : null,
      body_chars: bodyChars,
      dedup_primary: isDup ? 0 : 1,
      first_commit_at: '2026-01-01T00:00:00Z',
      last_commit_at: '2026-07-01T00:00:00Z',
      commit_count: 1 + (i % 9),
      sibling_count: i % 11,
      has_scripts: rnd() < 0.046 ? 1 : 0,   // R3: 4.6%
      content_sha_ok: 1,
    });
  }
  return out;
}

export function syntheticRepos(corpusRows) {
  const seen = new Map();
  for (const r of corpusRows) {
    if (seen.has(r.repo_full_name)) continue;
    const i = seen.size;
    seen.set(r.repo_full_name, {
      full_name: r.repo_full_name,
      owner: r.repo_full_name.split('/')[0],
      stars: (i * 37) % 5000, forks: (i * 7) % 400,
      is_fork: i % 13 === 0 ? 1 : 0,
      language: ['TypeScript', 'Python', 'Go', null][i % 4],
      license: LICENCES[i % LICENCES.length],
      description: `Synthetic repo ${i}`,
      created_at: '2026-01-01T00:00:00Z', pushed_at: '2026-08-01T00:00:00Z',
      metadata_fetched: 1,
    });
  }
  return [...seen.values()];
}
