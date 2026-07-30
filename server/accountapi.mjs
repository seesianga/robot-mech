/**
 * HTTP surface for the account service — fetch-standard in, fetch-standard out,
 * so the Cloudflare Worker (worker/index.mjs) and the LAN dev server
 * (server/mp-server.mjs) run the same routing, the same CORS and the same error
 * mapping. No runtime-specific API is touched here.
 *
 * Routes (all JSON, all under /api):
 *   GET  /api/health                 → { ok, service, time }
 *   POST /api/auth/register          { callsign, verifier, device } → session
 *   POST /api/auth/login             { callsign, verifier, device } → session
 *   GET  /api/auth/me                (Bearer) → { account, progress, rev }
 *   POST /api/auth/logout            (Bearer) → { ok }
 *   POST /api/auth/logout-all        (Bearer) → { ok }
 *   GET  /api/progress               (Bearer) → { rev, progress }
 *   PUT  /api/progress               (Bearer) { baseRev, progress, device }
 *                                    → { ok, rev } | 409 { rev, progress }
 *
 * CORS: the game is served from Cloudflare Pages while this API lives on the
 * Worker, so every call is cross-origin. Credentials ride in the Authorization
 * header rather than a cookie — third-party cookies are blocked by default in
 * Safari and Firefox, which would break sign-in on exactly the devices a
 * cross-device account is meant to serve.
 */

import { ApiError } from './accountcore.mjs';

const DEFAULT_ORIGINS = [
  /^https:\/\/([a-z0-9-]+\.)?robot-mech\.pages\.dev$/,
  /^https:\/\/([a-z0-9-]+\.)?robot-mech\.[a-z0-9-]+\.workers\.dev$/,
  /^https:\/\/robot-mech\.[a-z0-9-]+\.workers\.dev$/,
  // The previous Worker remains live as a rollback origin.
  /^https:\/\/([a-z0-9-]+\.)?veyra-prime\.[a-z0-9-]+\.workers\.dev$/,
  /^https:\/\/veyra-prime\.[a-z0-9-]+\.workers\.dev$/,
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
  /^http:\/\/\[::1\]:\d+$/,
  /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
  /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
];

const MAX_BODY_BYTES = 1024 * 1024;

function allowOrigin(origin, extra) {
  if (!origin) return '';
  const patterns = [...DEFAULT_ORIGINS, ...(extra ?? [])];
  for (const p of patterns) {
    if (typeof p === 'string' ? p === origin : p.test(origin)) return origin;
  }
  return '';
}

function corsHeaders(origin) {
  const h = {
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin) h['access-control-allow-origin'] = origin;
  return h;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(origin),
    },
  });
}

function bearer(request) {
  const raw = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m ? m[1].trim() : '';
}

async function readJson(request) {
  const len = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
    throw new ApiError(413, 'BODY_TOO_LARGE', 'That save is too large to sync.');
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, 'BODY_TOO_LARGE', 'That save is too large to sync.');
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new ApiError(400, 'BAD_JSON', 'Malformed request.');
  }
}

/**
 * @param {Request} request
 * @param {import('./accountcore.mjs').AccountService} service
 * @param {{ origins?: Array<string|RegExp>, clientIp?: string, prefix?: string }} [opts]
 * @returns {Promise<Response|null>} null when the path is not ours, so the
 *          caller can fall through to static assets / the match socket
 */
export async function handleAccountApi(request, service, opts = {}) {
  const prefix = opts.prefix ?? '/api';
  const url = new URL(request.url);
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return null;

  const origin = allowOrigin(request.headers.get('origin') ?? '', opts.origins);
  const route = url.pathname.slice(prefix.length) || '/';

  if (request.method === 'OPTIONS') {
    // a preflight from an origin we do not allow gets a 403 with no ACAO —
    // the browser then blocks the real request, which is the intended answer
    return new Response(null, { status: origin ? 204 : 403, headers: corsHeaders(origin) });
  }

  const ip = opts.clientIp
    ?? request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? '';

  try {
    const post = request.method === 'POST';
    const get = request.method === 'GET';

    if (route === '/health' && get) {
      return json({ ok: true, service: 'robot-mech-accounts', time: Date.now() }, 200, origin);
    }

    if (route === '/auth/register' && post) {
      const body = await readJson(request);
      const out = await service.register({ callsign: body.callsign, verifier: body.verifier, device: body.device, ip });
      return json(out, 201, origin);
    }

    if (route === '/auth/login' && post) {
      const body = await readJson(request);
      const out = await service.login({ callsign: body.callsign, verifier: body.verifier, device: body.device, ip });
      return json(out, 200, origin);
    }

    if (route === '/auth/me' && get) {
      return json(await service.me(bearer(request)), 200, origin);
    }

    if (route === '/auth/logout' && post) {
      return json(await service.logout(bearer(request)), 200, origin);
    }

    if (route === '/auth/logout-all' && post) {
      return json(await service.logoutAll(bearer(request)), 200, origin);
    }

    if (route === '/progress' && get) {
      return json(await service.getProgress(bearer(request)), 200, origin);
    }

    if (route === '/progress' && request.method === 'PUT') {
      const body = await readJson(request);
      const out = await service.putProgress(bearer(request), {
        baseRev: body.baseRev,
        progress: body.progress,
        device: body.device,
      });
      return json(out, 200, origin);
    }

    return json({ error: 'NOT_FOUND', message: 'No such endpoint.' }, 404, origin);
  } catch (e) {
    if (e instanceof ApiError) {
      return json({ error: e.code, message: e.message, ...(e.payload ?? {}) }, e.status, origin);
    }
    // never leak an internal message to the client; the platform log keeps it
    console.error('[accounts] unhandled', e);
    return json({ error: 'INTERNAL', message: 'The registry is offline. Try again shortly.' }, 500, origin);
  }
}
