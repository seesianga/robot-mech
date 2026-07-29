#!/usr/bin/env node
/**
 * Verify the split deployment: the game is served from Cloudflare Pages
 * (robot-mech.pages.dev) but the match server is a Durable Object on the
 * veyra-prime Worker, because Pages cannot host a DO class.
 *
 * That makes multiplayer a CROSS-ORIGIN WebSocket, which nothing else in the test
 * suite covers — the local suites talk to the Node relay on :4177 and the Worker
 * build was same-origin. If the Worker ever gains an Origin check, or the Pages
 * build loses VITE_MP_URL, multiplayer breaks on the live site only and this is the
 * check that catches it.
 *
 * Usage: npm run mporigin
 */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { chromium } from 'playwright-core';
const cd=path.join(os.homedir(),'Library','Caches','ms-playwright');let exe=null;
for(const d of fs.readdirSync(cd).filter(x=>x.startsWith('chromium')).sort().reverse()){
 for(const c of [path.join(cd,d,'chrome-headless-shell-mac-arm64','chrome-headless-shell')]) if(fs.existsSync(c)){exe=c;break;} if(exe)break;}
const b=await chromium.launch({executablePath:exe,args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage();
await p.goto('https://robot-mech.pages.dev/play.html',{waitUntil:'domcontentloaded',timeout:60000});
const res = await p.evaluate(() => new Promise((resolve) => {
  const url = 'wss://veyra-prime.seesianga.workers.dev/ws';
  const t0 = Date.now();
  const ws = new WebSocket(url);
  const out = { origin: location.origin, url, msgs: [] };
  const done = (verdict) => { out.verdict = verdict; out.ms = Date.now() - t0; try { ws.close(); } catch {} resolve(out); };
  ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', name: 'XORIGIN' })); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    out.msgs.push(m.t);
    if (m.t === 'welcome') done('CONNECTED');
  };
  ws.onerror = () => done('ERROR');
  ws.onclose = (e) => { if (!out.verdict) done(`CLOSED code=${e.code}`); };
  setTimeout(() => { if (!out.verdict) done('TIMEOUT'); }, 20000);
}));
await b.close();
console.log(`page origin : ${res.origin}`);
console.log(`match server: ${res.url}`);
console.log(`result      : ${res.verdict} in ${res.ms}ms  (messages: ${res.msgs.join(',') || 'none'})`);
process.exit(res.verdict === 'CONNECTED' ? 0 : 1);
