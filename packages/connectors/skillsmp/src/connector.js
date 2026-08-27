/**
 * SkillsMPConnector. DES-005. REQ-004, REQ-002, REQ-006, REQ-007, REQ-026, REQ-096.
 *
 * DISCOVERY AND SIGNAL ONLY. SkillsMP hosts no content - it indexes SKILL.md files that
 * live in public GitHub repositories, and its own ToS forbids systematically downloading
 * large portions of the website (DEC-002, R1 §3). So `getContent()` here returns
 * NotAvailable by design, and content resolution is GitHub's job.
 *
 * Access is PRE-AUTHORISED, verified live (DEC-038): `/developers` states "Anonymous
 * access is also available with lower rate limits", and both tiers have published quotas.
 * A published quota is the permission. What binds us is staying inside it.
 */
import { fetchWithRetry } from '../../gitskills/src/retry.js';

export const SOURCE_ID = 'skillsmp';
const BASE = 'https://skillsmp.com';

/**
 * DOM-012 / REQ-006: the access policy is DATA the runtime enforces, not a promise the
 * connector makes. Figures are SkillsMP's own published limits, treated as ceilings.
 */
export const SKILLSMP_ACCESS_POLICY = Object.freeze({
  max_concurrency: 1,
  requests_per_minute: 10,          // anonymous tier; 30 with a key
  requests_per_day: 50,             // anonymous tier; 500 with a key
  auth: 'none',                     // 'bearer' when a key is supplied
  permitted_methods: ['rest', 'mcp'],
  robots: { applies: true, url: `${BASE}/robots.txt`, crawl_delay_seconds: 1 },
  tos_notes:
    'Discovery and signal only. SkillsMP hosts no content and grants no rights over any ' +
    'skill: "Each skill is subject to its repository\'s license." Never bulk-fetch ' +
    '/creators/** HTML - the ToS forbids systematically downloading large portions of the site.',
  forbidden: ['html-bulk', 'sitemap-crawl'],
  attribution: { source: 'SkillsMP', url: BASE,
                 note: 'Independent community project, not affiliated with Anthropic or OpenAI.' },
});

/** REQ-004: enumeration is IMPOSSIBLE by design and the connector must not pretend otherwise. */
export const SEARCH_LIMITS = Object.freeze({
  MAX_LIMIT: 50,          // per page, per the OpenAPI spec
  MAX_PAGE: 50,           // page cap
  MAX_RESULTS_PER_QUERY: 2500,     // 50 x 50 - the hard ceiling on any single query
  QUERY_REQUIRED: true,            // `q` is required; wildcards are unsupported
});

export class SkillsMPQueryRequired extends Error {
  constructor() {
    super('MISSING_QUERY: SkillsMP search requires a keyword. Wildcards are unsupported and ' +
          'the catalogue cannot be enumerated - this connector provides discovery, not a crawl (DEC-002).');
    this.name = 'SkillsMPQueryRequired';
  }
}

export class SkillsMPConnector {
  #apiKey; #ua; #fetch; #robots; #requests = 0; #breaker;

  constructor({ apiKey = null,
                userAgent = 'AppMD-Ingest/0.1 (+https://skill.appmd.dev; skill indexing)',
                fetchImpl = null, robots = null, circuitBreaker = null } = {}) {
    // REQ-026: truthful and contactable. Impersonation is refused at construction, not
    // left to reviewer vigilance.
    if (/Mozilla|Chrome|Safari|Googlebot|bingbot/i.test(userAgent)) {
      throw new Error('REQ-026 violated: the User-Agent must identify AppMD, not impersonate a browser or bot');
    }
    if (!/AppMD/.test(userAgent)) {
      throw new Error('REQ-026 violated: the User-Agent must name AppMD');
    }
    this.#apiKey = apiKey; this.#ua = userAgent;
    this.#fetch = fetchImpl;   // injected for offline tests (NFR-030)
    this.#robots = robots;
    this.#breaker = circuitBreaker;
  }

  id() { return SOURCE_ID; }
  get requests() { return this.#requests; }

  accessPolicy() {
    return this.#apiKey
      ? { ...SKILLSMP_ACCESS_POLICY, auth: 'bearer', requests_per_minute: 30, requests_per_day: 500 }
      : SKILLSMP_ACCESS_POLICY;
  }

  /**
   * REQ-004 / REQ-009. Keyword discovery. There is deliberately no discoverAll():
   * the catalogue cannot be enumerated through this API and a method implying otherwise
   * would be a lie in the shape of a function.
   */
  async discover({ q, limit = 20, page = 1, sortBy = 'stars', category = null,
                   occupation = null, language = null } = {}) {
    if (typeof q !== 'string' || q.trim() === '') throw new SkillsMPQueryRequired();
    if (q.trim() === '*') throw new SkillsMPQueryRequired();     // wildcards unsupported

    const n = Math.min(Math.max(1, limit), SEARCH_LIMITS.MAX_LIMIT);
    const p = Math.min(Math.max(1, page), SEARCH_LIMITS.MAX_PAGE);

    const url = new URL('/api/v1/skills/search', BASE);
    url.searchParams.set('q', q.trim());
    url.searchParams.set('limit', String(n));
    url.searchParams.set('page', String(p));
    url.searchParams.set('sortBy', sortBy);
    if (category) url.searchParams.set('category', category);
    if (occupation) url.searchParams.set('occupation', occupation);
    if (language) url.searchParams.set('language', language);

    const body = await this.#request(url.toString());
    const skills = body?.data?.skills ?? [];
    const pagination = body?.data?.pagination ?? {};

    return {
      records: skills.map((s) => this.#toDiscoveryRecord(s)),
      pagination: {
        page: pagination.page ?? p,
        hasNext: pagination.hasNext ?? false,
        // The API states `total` may be a proven LOWER BOUND, not an exact count.
        total: pagination.total ?? null,
        totalIsExact: pagination.totalIsExact ?? false,
        isCapped: pagination.isCapped ?? false,
      },
      // REQ-085: the ceiling travels with the result so no caller mistakes a page for a catalogue.
      disclosure: {
        method: 'keyword-search',
        query: q.trim(),
        enumerable: false,
        max_results_this_query: SEARCH_LIMITS.MAX_RESULTS_PER_QUERY,
        note: 'SkillsMP cannot be enumerated: `q` is required, wildcards are unsupported, and ' +
              'pagination is capped at 50 pages x 50 results per distinct query.',
      },
    };
  }

  /** REQ-002: the same normalised shape every connector emits. */
  #toDiscoveryRecord(s) {
    const repo = repoFromGithubUrl(s.githubUrl);
    return {
      source: SOURCE_ID,
      external_id: String(s.id ?? s.skillUrl ?? s.githubUrl),
      // DEC-014: identity comes from GitHub coordinates, never from the aggregator's id.
      repo_full_name: repo?.full_name ?? null,
      path: repo?.path ?? null,
      name: s.name ?? null,
      url: s.githubUrl ?? null,                 // the ORIGIN, not the SkillsMP page
      author: s.author ?? repo?.owner ?? null,
      license_hint: null,                        // SkillsMP grants no rights and states none
      version_ref: null,
      discovered_at: s.updatedAt ?? null,
      channel: 'rest',                           // REQ-096: which channel produced this
      source_payload: { ...s, _skillsmp_page: s.skillUrl },
    };
  }

  identify(record) {
    return { source: SOURCE_ID, repo_full_name: record.repo_full_name, path: record.path };
  }

  getMetadata(record) {
    const p = record.source_payload ?? {};
    return {
      stars: p.stars ?? null,                    // a POPULARITY SIGNAL, never the sole ranking (BRIEF §17)
      content_language: p.contentLanguage ?? null,
      skillsmp_url: p.skillUrl ?? null,
      description: p.description ?? null,
    };
  }

  /**
   * DEC-002: SkillsMP hosts no content. Returning NotAvailable is the honest answer, and
   * it routes the caller to GitHub, which is where the bytes actually are.
   */
  getContent() {
    return { status: 'NotAvailable',
             reason: 'SkillsMP indexes SKILL.md files; it does not host them. Resolve content from the origin repository.' };
  }

  getVersion() { return { ref: null, kind: 'none' }; }

  async #request(url) {
    // REQ-096 / NFR-037: consult the robots policy before issuing anything, when one is
    // supplied. `Disallow: /api/` targets crawlers; this client is a documented API
    // consumer with a truthful identity (DEC-038). The channel is recorded either way.
    if (this.#robots && typeof this.#robots.isAllowed === 'function') {
      const verdict = this.#robots.isAllowed(url, { channel: 'api', identity: this.#ua });
      if (verdict === false) throw new Error(`ROBOTS_DISALLOWED: ${url}`);
    }
    if (this.#breaker?.isOpen?.()) {
      throw new Error('CIRCUIT_OPEN: SkillsMP is failing repeatedly; requests are paused (REQ-025)');
    }

    const headers = { 'User-Agent': this.#ua, Accept: 'application/json' };
    if (this.#apiKey) headers.Authorization = `Bearer ${this.#apiKey}`;

    try {
      const res = this.#fetch
        ? await this.#fetch(url, { headers })
        : await fetchWithRetry(url, { headers });
      this.#requests++;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = body?.error?.code ?? `HTTP_${res.status}`;
        this.#breaker?.recordFailure?.();
        throw new Error(`${code}: ${body?.error?.message ?? 'SkillsMP request failed'}`);
      }
      this.#breaker?.recordSuccess?.();
      return await res.json();
    } catch (e) {
      this.#breaker?.recordFailure?.();
      throw e;
    }
  }
}

/** `https://github.com/owner/repo/tree/main/skills/x` -> coordinates. */
export function repoFromGithubUrl(url) {
  if (typeof url !== 'string') return null;
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(?:tree|blob)\/[^/]+\/(.*))?/.exec(url);
  if (!m) return null;
  return { owner: m[1], repo: m[2], full_name: `${m[1]}/${m[2]}`, path: m[3] ?? null };
}
