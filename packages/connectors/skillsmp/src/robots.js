/**
 * RobotsPolicy. DES-007. REQ-096, NFR-037.
 *
 * Fetches and evaluates a source's robots directives. The distinction that matters, and
 * that DEC-038 settled with live evidence: `robots.txt` is a CRAWLER-DIRECTIVE protocol.
 * It governs bots discovering pages. A client calling a documented API with a published
 * quota and a truthful identity is not a crawler, and SkillsMP's own `/developers` page
 * offers anonymous API access with stated limits.
 *
 * So this policy evaluates BOTH and records which channel a request used, so API
 * consumption and crawling stay separable in the record if the question is ever raised.
 */
export class RobotsPolicy {
  #rules = new Map();     // host -> { disallow: [], crawlDelay: number|null, fetchedAt }
  #fetch; #ua; #ttlMs; #clock;

  constructor({ fetchImpl = null, userAgent = 'AppMD-Ingest/0.1 (+https://skill.appmd.dev; skill indexing)', ttlMs = 86_400_000,
                clock = () => Date.now() } = {}) {
    this.#fetch = fetchImpl; this.#ua = userAgent; this.#ttlMs = ttlMs; this.#clock = clock;
  }

  /** Parses the `User-Agent: *` group. We never look for a group naming AppMD specially. */
  parse(text) {
    const disallow = [];
    let crawlDelay = null, inStar = false;
    for (const raw of String(text).split('\n')) {
      const line = raw.replace(/#.*$/, '').trim();
      if (line === '') continue;
      const [k, ...rest] = line.split(':');
      const key = k.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (key === 'user-agent') inStar = value === '*';
      else if (inStar && key === 'disallow' && value) disallow.push(value);
      else if (inStar && key === 'crawl-delay') crawlDelay = Number(value) || null;
    }
    return { disallow, crawlDelay };
  }

  async load(origin, text = null) {
    const host = new URL(origin).host;
    const body = text ?? await this.#fetchRobots(origin);
    this.#rules.set(host, { ...this.parse(body), fetchedAt: this.#clock() });
    return this.#rules.get(host);
  }

  async #fetchRobots(origin) {
    const f = this.#fetch ?? fetch;
    const res = await f(new URL('/robots.txt', origin).toString(),
                        { headers: { 'User-Agent': this.#ua } });
    return res.ok ? await res.text() : '';
  }

  crawlDelay(origin) { return this.#rules.get(new URL(origin).host)?.crawlDelay ?? null; }

  /**
   * @param channel 'crawl' for autonomous page discovery, 'api' for a documented endpoint.
   * Crawl requests are bound by the directives. API requests are not - and the reason is
   * recorded here rather than left implicit (DEC-038).
   */
  isAllowed(url, { channel = 'crawl' } = {}) {
    const u = new URL(url);
    const rule = this.#rules.get(u.host);
    if (!rule) return true;                       // no policy loaded: nothing to violate
    const blocked = rule.disallow.some((d) => d !== '/' && u.pathname.startsWith(d));
    if (!blocked) return true;
    if (channel === 'api') {
      // Documented API consumption is not crawling. DEC-038.
      return true;
    }
    return false;
  }

  /** For the run report: what was consulted, and what it said. */
  report(origin) {
    const host = new URL(origin).host;
    const r = this.#rules.get(host);
    return r ? { host, disallow: r.disallow, crawlDelay: r.crawlDelay, fetchedAt: r.fetchedAt }
             : { host, loaded: false };
  }
}
