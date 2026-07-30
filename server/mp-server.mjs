// LAN/dev twin of the production Worker — the same shared 5v5 quick-match core
// (matchcore.mjs) the Durable Object runs, plus the same account API
// (accountapi.mjs) the Worker serves, so `npm run dev` has working pilot
// accounts with no Cloudflare round trip. Saves land in a JSON file instead of
// D1; everything above the store adapter is byte-for-byte the deployed code.
//
// Run:  npm run mp        (ws://<host>:4177  ·  http://<host>:4177/api)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { MatchCore } from './matchcore.mjs';
import { AccountService } from './accountcore.mjs';
import { MemoryAccountStore } from './accountstore-memory.mjs';
import { handleAccountApi } from './accountapi.mjs';

const PORT = Number(process.env.MP_PORT ?? 4177);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mechs = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'mechs.json'), 'utf8')).mechs;
const mpCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'hangar', 'mp.json'), 'utf8'));
const core = new MatchCore(new Map(mechs.map((m) => [m.id, m.tons])), { deckExhausted: mpCfg.deckExhausted });

const dbFile = process.env.ACCOUNTS_FILE ?? path.join(ROOT, '.wrangler', 'dev-accounts.json');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const accounts = new AccountService(new MemoryAccountStore({ file: dbFile }));

/** node:http request → fetch Request, so the dev server runs the deployed router. */
async function toFetchRequest(req) {
  const url = `http://${req.headers.host ?? `localhost:${PORT}`}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  }
  if (req.method === 'GET' || req.method === 'HEAD') return new Request(url, { method: req.method, headers });
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return new Request(url, { method: req.method, headers, body: Buffer.concat(chunks) });
}

const server = http.createServer((req, res) => {
  void (async () => {
    try {
      const request = await toFetchRequest(req);
      const out = await handleAccountApi(request, accounts, { clientIp: req.socket.remoteAddress ?? '' });
      if (!out) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('robot-mech dev server: /api/* for accounts, ws:// for matches\n');
        return;
      }
      const body = Buffer.from(await out.arrayBuffer());
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(body);
    } catch (e) {
      console.error('[api]', e);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"INTERNAL","message":"dev server failure"}');
    }
  })();
});

const wss = new WebSocketServer({ server });
server.listen(PORT, () => {
  console.log(`[mp] Robot Mech match server (5v5 quick-match) on ws://0.0.0.0:${PORT}`);
  console.log(`[api] pilot accounts on http://localhost:${PORT}/api  →  ${path.relative(ROOT, dbFile)}`);
});

wss.on('connection', (ws) => {
  core.addClient(ws, (msg) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  });
  ws.on('message', (raw) => {
    try { core.onMessage(ws, raw.toString()); } catch { /* never kill the socket on a bad frame */ }
  });
  ws.on('close', () => core.removeClient(ws));
  ws.on('error', () => core.removeClient(ws));
});
