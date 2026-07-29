// Online match server — Cloudflare Durable Object transport around the shared
// 5v5 quick-match core (server/matchcore.mjs). Live WebSockets pin the DO for
// the duration of queues and matches; room state is in-memory by design.
import { DurableObject } from 'cloudflare:workers';
import { MatchCore } from '../server/matchcore.mjs';
import mechsJson from '../content/mechs.json';
import mpJson from '../content/hangar/mp.json';

const TONS = new Map(mechsJson.mechs.map((m) => [m.id, m.tons]));

export class MatchLobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new MatchCore(TONS, { deckExhausted: mpJson.deckExhausted });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.core.addClient(server, (msg) => {
      try { server.send(JSON.stringify(msg)); } catch { /* closed */ }
    });
    server.addEventListener('message', (e) => {
      try { this.core.onMessage(server, e.data); } catch { /* never kill the socket on a bad frame */ }
    });
    server.addEventListener('close', () => this.core.removeClient(server));
    server.addEventListener('error', () => this.core.removeClient(server));
    return new Response(null, { status: 101, webSocket: client });
  }
}
