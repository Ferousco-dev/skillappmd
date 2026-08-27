/**
 * Next.js configuration.
 *
 * THE REWRITE IS THE FRONTEND↔BACKEND CONNECTION. The browser calls `/api/v1/*` on
 * the same origin; Next forwards it to the Worker. Two consequences worth stating:
 *
 *   1 No CORS. A same-origin call needs no preflight and no allow-list, so the
 *     site cannot be broken by an origin list drifting out of date. The Worker's
 *     CORS handling stays for third-party API consumers, who are a different case.
 *   2 The API base stays `/api/v1` in the client, which is already its default,
 *     so nothing in the frontend needs to know where the backend actually lives.
 *
 * Set WORKER_ORIGIN to point at a deployed Worker. Unset, it targets the local
 * `wrangler dev` port so the site runs against a real backend with no cloud account.
 */
const WORKER_ORIGIN = process.env.WORKER_ORIGIN ?? 'http://localhost:8787'

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${WORKER_ORIGIN}/api/v1/:path*` }]
  },
}

export default nextConfig
