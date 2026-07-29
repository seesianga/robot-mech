#!/usr/bin/env node
/**
 * Live multiplayer protocol probe.
 *
 * Connects to the match server exactly as the client does (hello -> deck -> queue),
 * then logs every inbound message with a timestamp. An immediate 'end' with
 * winner:'draw' means the room clock ran out the instant the match started, which is
 * what a stalled or burst-firing server timer looks like from the outside.
 *
 * Usage: node scripts/probe_mp.mjs [wss://host/ws]
 */
import WebSocketLib from 'ws';
// Node's global WebSocket negotiates over HTTP/2 against Cloudflare and fails with
// 1006; the ws package forces HTTP/1.1 Upgrade, which is what the DO expects.
const WS = WebSocketLib;
const URL = process.argv[2] ?? 'wss://veyra-prime.seesianga.workers.dev/ws';
const t0 = Date.now();
const at = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

const ws = new WS(URL);
const seen = [];

ws.addEventListener('open', () => {
  console.log(`${at()} open`);
  ws.send(JSON.stringify({ t: 'hello', name: 'PROBE' }));
  ws.send(JSON.stringify({ t: 'deck', frames: [{ iid: 'probe-1', chassis: 'skarn' }] }));
  ws.send(JSON.stringify({ t: 'queue', mode: 'dm' }));
});

ws.addEventListener('message', (ev) => {
  let m; try { m = JSON.parse(ev.data.toString()); } catch { return; }
  seen.push(m.t);
  // clock ticks are noise unless they are misbehaving — show the first few and any jump
  if (m.t === 'clock') {
    if (seen.filter((x) => x === 'clock').length <= 3) console.log(`${at()} clock left=${m.left}`);
    return;
  }
  if (m.t === 'qtick') { console.log(`${at()} queue ${m.secs}s`); return; }
  console.log(`${at()} ${m.t} ${JSON.stringify(m).slice(0, 220)}`);
  if (m.t === 'end') {
    console.log(`\nMATCH ENDED at ${at()} — reason=${m.reason} winner=${m.winner}`);
    ws.close();
  }
});

ws.addEventListener('error', (e) => console.log(`${at()} error ${e.message ?? e}`));
ws.addEventListener('close', (e) => {
  console.log(`${at()} closed code=${e.code}`);
  const clocks = seen.filter((x) => x === 'clock').length;
  console.log(`messages: ${seen.length} (clock ticks: ${clocks})`);
  process.exit(0);
});

setTimeout(() => { console.log(`${at()} timeout — no match end`); ws.close(); }, 90000);
