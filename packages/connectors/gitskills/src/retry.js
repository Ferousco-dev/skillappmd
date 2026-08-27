/**
 * Bounded retry with exponential backoff and jitter. DES-014, DES-015.
 * REQ-019, REQ-024, NFR-023.
 *
 * Written after a live 500 carrying {"error":"the dataset index is loading, this can
 * take a minute"} - a transient warm-up, indistinguishable from a hard failure unless
 * you actually read the body. The SRS required this behaviour; the first reader
 * shipped without it, which is why REQ-024 is a requirement and not a habit.
 */
export const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(url, { headers = {}, maxAttempts = 5,
                                            baseMs = 800, rng = Math.random,
                                            sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res;

    if (!TRANSIENT_STATUS.has(res.status)) {
      throw new Error(`request failed: HTTP ${res.status}`);      // permanent: do not retry
    }

    // NFR-023: honour Retry-After when the source states one, in preference to our own backoff.
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.round(baseMs * 2 ** (attempt - 1) * (0.5 + rng() * 0.5));

    lastError = `HTTP ${res.status}`;
    if (attempt === maxAttempts) break;
    await sleep(wait);
  }
  throw new Error(`request failed after ${maxAttempts} attempts: ${lastError}`);
}
