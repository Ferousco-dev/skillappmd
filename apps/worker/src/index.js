/**
 * Cloudflare Worker entry point. CR-011, increment 14.
 *
 * The router is a pure function of (request) -> (response) and was built that way so it
 * could be tested without a socket. This file is the only place that knows about HTTP,
 * and it is deliberately thin: everything below it is the same code the CLI and the test
 * suite drive, so "works locally" and "works deployed" are claims about one implementation.
 *
 * REQ-071 governs the catch: an unexpected error must never leak internals to a caller.
 */
import { ApiRouter } from '../../api/src/router.js';
import { createD1CanonicalStore } from '../../../packages/adapters/d1/src/index.js';
import { GeminiEmbedder } from '../../../packages/adapters/gemini-embedder/src/index.js';
import { VectorizeIndex } from '../../../packages/adapters/vector-index/src/index.js';

/** REQ-097. Per-colo, which is NOT a global budget — see RSK-009. */
class ColoRateLimiter {
  #hits = new Map(); #budget; #windowMs;
  constructor({ budget = 120, windowMs = 60_000 } = {}) { this.#budget = budget; this.#windowMs = windowMs; }

  acquire(clientId, now = Date.now()) {
    const seen = this.#hits.get(clientId);
    if (!seen || now - seen.start >= this.#windowMs) {
      this.#hits.set(clientId, { start: now, count: 1 });
      return { allowed: true };
    }
    seen.count++;
    if (seen.count <= this.#budget) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.ceil((seen.start + this.#windowMs - now) / 1000) };
  }
  release() {}
  status() { return { tracked: this.#hits.size }; }
}

const limiter = new ColoRateLimiter();

/** CORS for the landing page's search. Read-only API, GET only, so this is narrow. */
const cors = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'If-None-Match, Content-Type',
  'Access-Control-Expose-Headers': 'ETag, Retry-After',
  Vary: 'Origin',
});

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: origin ? cors(origin) : {} });
    }

    if (!env.DB) {
      // A missing binding is a deployment error, not a runtime condition. Say so once,
      // clearly, rather than failing per-query with a null-property error.
      return json({ error: { code: 'NOT_CONFIGURED', message: 'No D1 binding. Check wrangler.toml.' } }, 503, {});
    }

    const store = createD1CanonicalStore(env.DB);

    // NFR-042. Semantic resolution is present only when BOTH the key and the index are
    // configured. Absent, /resolve answers 503 and says so - it never falls back to
    // keyword search, which would make a half-configured deployment look complete.
    let embedder = null, vectors = null;
    if (env.GEMINI_API_KEY && env.VECTORIZE) {
      embedder = new GeminiEmbedder({ apiKey: env.GEMINI_API_KEY, dimensions: 768 });
      vectors = new VectorizeIndex(env.VECTORIZE, { dimensions: 768 });
    }

    const router = new ApiRouter({
      store,
      clock: () => new Date().toISOString(),
      limiter,
      requestId: () => crypto.randomUUID(),
      embedder,
      vectors,
    });

    let res;
    try {
      res = await router.handle({
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v])),
        clientId: request.headers.get('CF-Connecting-IP') ?? 'anonymous',
      });
    } catch (err) {
      // REQ-071: never emit internals. The message is dropped deliberately.
      console.error('unhandled', err?.stack ?? String(err));
      return json({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } }, 500,
                  origin ? cors(origin) : {});
    }

    const headers = { ...(res.headers ?? {}), ...(origin ? cors(origin) : {}) };

    // 304 must carry no body, per RFC 9110 and per CR-007's own test.
    if (res.status === 304) return new Response(null, { status: 304, headers });
    return json(res.body, res.status, headers);
  },
};

// NOTE: no other exports. workerd treats every module export as an entrypoint and
// rejects a non-handler value ("Incorrect type for map entry"), so a stray
// `export { API_VERSION }` stops the Worker STARTING. `--dry-run` bundles fine and says
// nothing; only actually booting the runtime catches it.
const json = (body, status, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
