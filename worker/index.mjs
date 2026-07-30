// Robot Mech — Cloudflare Worker. Three jobs on one origin:
//   /api/*  pilot accounts + cloud campaign saves (D1)
//   /ws     the ONLINE match server (MatchLobby Durable Object)
//   *       the built game (static assets)
//
// The game itself is served from Cloudflare Pages (robot-mech.pages.dev) —
// Pages can host neither a Durable Object nor a D1-backed API on the same
// origin — so in production the browser reaches /api and /ws here,
// cross-origin. CORS for that lives in server/accountapi.mjs.
export { MatchLobby } from './matchlobby.mjs';

import { AccountService } from '../server/accountcore.mjs';
import { D1AccountStore } from '../server/accountstore-d1.mjs';
import { handleAccountApi } from '../server/accountapi.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      // one lobby DO carries all rooms — right-sized for private-match volume;
      // per-room DO sharding is the documented scale path (docs/multiplayer-design.md §2)
      return env.MATCH.getByName('global').fetch(request);
    }

    if (url.pathname.startsWith('/api')) {
      if (!env.DB) {
        return new Response(JSON.stringify({ error: 'NO_DATABASE', message: 'Account database is not bound to this deployment.' }),
          { status: 503, headers: { 'content-type': 'application/json' } });
      }
      const service = new AccountService(new D1AccountStore(env.DB));
      const extra = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const res = await handleAccountApi(request, service, { origins: extra });
      if (res) return res;
    }

    return env.ASSETS.fetch(request);
  },
};
