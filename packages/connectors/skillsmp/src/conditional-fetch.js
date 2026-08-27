/**
 * Conditional re-fetch. DES-015. REQ-028.
 *
 * "The fetcher shall skip re-fetch when the source reports content unchanged."
 *
 * A cache keyed by URL is NOT this: it avoids the request entirely and can serve stale
 * bytes forever. A conditional request asks the SOURCE whether anything changed and
 * accepts its answer - which is both correct and the polite use of someone else's
 * bandwidth (NFR-023).
 */
export class ConditionalFetcher {
  #validators = new Map();   // url -> { etag, lastModified, seenAt }
  #fetch; #ua;
  #stats = { requests: 0, notModified: 0, fetched: 0 };

  constructor({ fetchImpl = null, userAgent = 'AppMD-Ingest/0.1 (+https://skill.appmd.dev; skill indexing)' } = {}) {
    this.#fetch = fetchImpl; this.#ua = userAgent;
  }

  get stats() { return { ...this.#stats }; }
  validatorFor(url) { return this.#validators.get(url) ?? null; }

  /** Remembers a validator learned from any source, including a corpus row's commit sha. */
  remember(url, { etag = null, lastModified = null, versionRef = null }) {
    this.#validators.set(url, { etag, lastModified, versionRef, seenAt: Date.now() });
  }

  /**
   * @returns {{status:'not-modified'|'fetched', body?:any, unchanged:boolean}}
   */
  async fetchIfChanged(url, { versionRef = null } = {}) {
    const known = this.#validators.get(url);

    // A version identifier the source already gave us (a commit sha, a blob sha) settles
    // the question without a request at all - the cheapest possible "unchanged".
    if (known?.versionRef && versionRef && known.versionRef === versionRef) {
      this.#stats.notModified++;
      return { status: 'not-modified', unchanged: true, reason: 'version ref unchanged' };
    }

    const headers = { 'User-Agent': this.#ua };
    if (known?.etag) headers['If-None-Match'] = known.etag;
    if (known?.lastModified) headers['If-Modified-Since'] = known.lastModified;

    const f = this.#fetch ?? fetch;
    const res = await f(url, { headers });
    this.#stats.requests++;

    if (res.status === 304) {
      this.#stats.notModified++;
      return { status: 'not-modified', unchanged: true, reason: 'source returned 304' };
    }
    if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);

    const etag = res.headers?.get?.('etag') ?? null;
    const lastModified = res.headers?.get?.('last-modified') ?? null;
    this.#validators.set(url, { etag, lastModified, versionRef, seenAt: Date.now() });
    this.#stats.fetched++;
    return { status: 'fetched', unchanged: false, body: await res.text(), etag, lastModified };
  }
}
