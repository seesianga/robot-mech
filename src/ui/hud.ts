import * as THREE from 'three';
import type { Mech } from '../sim/mech';
import type { MissionPhase } from '../sim/mission';
import { ZONES, ZONE_NAMES, type ZoneId } from '../sim/types';
import type { NavView } from '../sim/nav';
import { makeAngleSpring, stepAngleSpring, wrapPi, DEG, type AngleSpring } from '../sim/navmath';
import { navString } from '../sim/navroutes';
import { navReducedMotion, type NavPrefs } from '../save/navprefs';

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; font-family: 'Courier New', monospace; color: #7ee6b0; z-index: 5;
  --amber: #ffb347; --red: #ff5533; --dim: rgba(126,230,176,.55); --navcyan: #3fd8f0; --navscale: 1; }
#hud .panel { position: absolute; background: rgba(8,14,12,.55); border: 1px solid rgba(126,230,176,.35); border-radius: 3px; padding: 6px 8px; }
#objective { top: 14px; left: 50%; transform: translateX(-50%); text-align: center; min-width: 340px; }
#objective .title { font-size: 15px; letter-spacing: 2px; color: var(--amber); }
#objective .sub { font-size: 11px; color: var(--dim); margin-top: 2px; }
#timerbox { position: absolute; top: 72px; left: 50%; transform: translateX(-50%); text-align: center;
  font-size: 17px; letter-spacing: 3px; color: var(--amber); background: rgba(8,14,12,.55);
  border: 1px solid rgba(255,179,71,.4); border-radius: 3px; padding: 4px 14px; display: none; }
#timerbox.critical { color: var(--red); border-color: var(--red); animation: blink .5s steps(2) infinite; }
#heatwrap { right: 24px; bottom: 120px; width: 26px; height: 240px; padding: 4px; }
#heatbar { position: absolute; bottom: 4px; left: 4px; right: 4px; background: linear-gradient(#2a2, #7ee6b0); }
#heatwrap .redline { position: absolute; left: 0; right: 0; top: 20%; border-top: 1px dashed var(--red); }
#heatwrap .amberline { position: absolute; left: 0; right: 0; top: 30%; border-top: 1px dashed var(--amber); }
#heatlabel { position: absolute; bottom: -18px; left: -6px; font-size: 10px; color: var(--dim); }
#throttle { left: 24px; bottom: 120px; width: 30px; height: 200px; padding: 4px; }
#throttle .tick { position: absolute; left: 4px; right: 4px; height: 1px; background: rgba(126,230,176,.3); }
#throttle .zero { background: rgba(126,230,176,.8); }
#throtfill { position: absolute; left: 5px; right: 5px; background: rgba(126,230,176,.5); }
#throtlabel { position: absolute; bottom: -18px; left: -8px; font-size: 10px; color: var(--dim); }
#twist { position: absolute; left: 70px; bottom: 130px; width: 90px; height: 90px; }
#weapons { right: 24px; bottom: 380px; min-width: 190px; font-size: 12px; }
#weapons .w { display: flex; justify-content: space-between; gap: 10px; padding: 1px 0; }
#weapons .w .nm { color: #cfe; }
#weapons .rdy { color: #7ee6b0; } #weapons .cd { color: var(--amber); } #weapons .dead { color: var(--red); text-decoration: line-through; }
#radar { position: absolute; left: 24px; top: 24px; }
#selfdoll { position: absolute; left: 24px; bottom: 360px; }
#targetwrap { position: absolute; right: 24px; top: 24px; text-align: center; }
#targetwrap .nm { font-size: 12px; color: var(--amber); margin-bottom: 2px; }
#crosshair { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); }
#leadpip { position: absolute; width: 10px; height: 10px; border: 1px solid var(--amber); transform: translate(-50%,-50%) rotate(45deg); display: none; }
#objmark { position: absolute; display: none; color: var(--amber); text-align: center; transform: translate(-50%,-50%);
  pointer-events: none; text-shadow: 0 0 8px rgba(255,179,71,.85); line-height: 1.1; }
#objmark .arr { display: inline-block; font-size: 17px; }
#objmark .d { display: block; font-size: 11px; letter-spacing: 1px; }
/* PATHLIGHT — navigation is cyan; amber/red stay reserved for warnings.
   Every state is shape + label, never color alone. */
#navcompass { position: absolute; top: 96px; left: 50%; transform: translateX(-50%) scale(var(--navscale)); display: none; }
#navarrow { position: absolute; display: none; color: var(--navcyan); text-align: center;
  transform: translate(-50%,-50%) scale(var(--navscale)); line-height: 1.05; pointer-events: none;
  text-shadow: 0 0 8px rgba(63,216,240,.8), 0 1px 2px #04110f; }
#navarrow svg { display: block; margin: 0 auto; overflow: visible; }
#navarrow svg path, #navarrow svg circle { fill: var(--navcyan); stroke: #04110f; stroke-width: 2px; paint-order: stroke; }
#navarrow svg .ln { fill: none; stroke: var(--navcyan); stroke-width: 3px; }
#navarrow svg g { display: none; }
#navarrow.st-on_course .g-chev, #navarrow.st-steer .g-chev, #navarrow.st-offscreen .g-chev { display: block; }
#navarrow.st-behind .g-behind { display: block; }
#navarrow.st-arrived .g-check { display: block; }
#navarrow.st-rerouting .g-ring { display: block; }
#navarrow.st-arrived svg { animation: navbloom .5s ease-out; }
#navarrow.st-rerouting svg { animation: navspin 1.6s linear infinite; }
#navarrow .lbl { display: block; font-size: 10px; letter-spacing: 2px; }
#navarrow .d { display: block; font-size: 12px; letter-spacing: 1px; }
#navarrow.hc { text-shadow: 0 0 0 transparent; color: #fff; }
#navarrow.hc svg path, #navarrow.hc svg circle { stroke-width: 3px; }
#navwp { position: absolute; display: none; color: var(--navcyan); text-align: center; transform: translate(-50%,-100%);
  pointer-events: none; text-shadow: 0 1px 2px #04110f; line-height: 1.2; }
#navwp .nm { display: block; font-size: 12px; letter-spacing: 3px; }
#navwp .d { display: block; font-size: 11px; letter-spacing: 1px; color: rgba(63,216,240,.8); }
#navwp.hc { color: #fff; }
@keyframes navbloom { 0% { transform: scale(.6); } 55% { transform: scale(1.3); } 100% { transform: scale(1); } }
@keyframes navspin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { #navarrow.st-arrived svg, #navarrow.st-rerouting svg { animation: none; } }
#navarrow.rm svg { animation: none !important; }
.ebar { position: absolute; transform: translate(-50%,-100%); width: 72px; pointer-events: none; display: none; text-align: center; }
.ebar .nm { font-size: 9px; color: #ffb0a0; letter-spacing: 1px; text-shadow: 0 1px 2px #000; white-space: nowrap; }
.ebar .bg { height: 5px; background: rgba(10,14,12,.75); border: 1px solid rgba(255,120,90,.65); }
.ebar .f { height: 100%; background: #ff5533; }
#alert { position: absolute; left: 50%; top: 34%; transform: translateX(-50%); font-size: 26px; letter-spacing: 6px; color: var(--red);
  text-shadow: 0 0 12px rgba(255,85,51,.7); display: none; animation: blink .5s steps(2) infinite; }
#hint { position: absolute; top: 74px; left: 50%; transform: translateX(-50%); text-align: center; font-size: 13px;
  letter-spacing: 2px; color: var(--amber); background: rgba(8,14,12,.6); border: 1px solid rgba(255,179,71,.35);
  border-radius: 3px; padding: 5px 16px; display: none; }
@keyframes blink { 50% { opacity: .25; } }
#subtitles { position: absolute; bottom: 44px; left: 50%; transform: translateX(-50%); max-width: 760px; text-align: center;
  font-size: 15px; color: #e8f4ec; text-shadow: 0 1px 3px #000; }
#subtitles .speaker { color: var(--amber); }
#damageflash { position: fixed; inset: 0; background: radial-gradient(ellipse at center, transparent 55%, rgba(255,60,30,.45)); opacity: 0; transition: opacity .12s; }
.tut-hi { animation: tuthi 1.2s ease-in-out infinite; }
@keyframes tuthi { 50% { box-shadow: 0 0 0 3px rgba(255,179,71,.75), 0 0 18px rgba(255,179,71,.5); } }
@media (prefers-reduced-motion: reduce) { .tut-hi { animation: none; box-shadow: 0 0 0 2px rgba(255,179,71,.6); } }
#bootveil { position: fixed; inset: 0; background: #04070a; opacity: 1; transition: opacity 2.5s; pointer-events: none; }
#endscreen { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(4,8,7,.88); pointer-events: auto; }
#endscreen .card { border: 1px solid rgba(126,230,176,.5); background: rgba(8,16,13,.95); padding: 28px 40px; text-align: center; min-width: 420px; }
#endscreen h1 { letter-spacing: 6px; font-size: 26px; color: var(--amber); margin: 0 0 14px; font-weight: normal; }
#endscreen table { margin: 0 auto 16px; border-collapse: collapse; font-size: 13px; }
#endscreen td, #endscreen th { padding: 4px 14px; border-bottom: 1px solid rgba(126,230,176,.2); }
#endscreen button { pointer-events: auto; background: none; border: 1px solid var(--amber); color: var(--amber);
  font-family: inherit; font-size: 14px; letter-spacing: 2px; padding: 8px 26px; cursor: pointer; }
#endscreen button:hover { background: rgba(255,179,71,.15); }
#startscreen { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column;
  background: radial-gradient(ellipse at 50% 40%, #0a1512, #04070a); z-index: 20; cursor: pointer; }
#startscreen h1 { color: #7ee6b0; letter-spacing: 10px; font-size: 34px; font-weight: normal; margin-bottom: 6px; }
#startscreen h2 { color: rgba(126,230,176,.5); letter-spacing: 4px; font-size: 13px; font-weight: normal; margin-bottom: 40px; }
#startscreen .ignite { color: var(--amber); border: 1px solid var(--amber); padding: 12px 34px; letter-spacing: 4px; font-size: 15px; animation: blink 1.6s steps(2) infinite; }
#startscreen .controls { margin-top: 42px; color: rgba(200,230,215,.55); font-size: 11px; line-height: 1.8; text-align: center; }
`;

function zoneColor(frac: number, destroyed: boolean): string {
  if (destroyed) return '#2a1512';
  if (frac > 0.66) return '#39d98a';
  if (frac > 0.33) return '#ffb347';
  return '#ff5533';
}

const DOLL: Array<[ZoneId, number, number, number, number]> = [
  ['head', 38, 0, 24, 14],
  ['ct', 33, 18, 34, 42],
  ['lt', 12, 20, 18, 36],
  ['rt', 70, 20, 18, 36],
  ['la', 0, 22, 10, 34],
  ['ra', 90, 22, 10, 34],
  ['ll', 22, 64, 22, 44],
  ['rl', 56, 64, 22, 44],
];

export class HUD {
  private root: HTMLElement;
  private radarCanvas: HTMLCanvasElement;
  private selfCanvas: HTMLCanvasElement;
  private targetCanvas: HTMLCanvasElement;
  private els: Record<string, HTMLElement> = {};
  private subtitleTimer = 0;
  private alertText = '';
  private enemyBars = new Map<number, HTMLElement>();
  // --- PATHLIGHT (nav guidance) ---
  private navCompassCanvas!: HTMLCanvasElement;
  private navArrowSvg!: SVGElement;
  private navDistEl!: HTMLElement;
  private navLblEl!: HTMLElement;
  private navWpNmEl!: HTMLElement;
  private navWpDEl!: HTMLElement;
  private navSpring: AngleSpring = makeAngleSpring(0);
  private navStateClass = '';
  private navDistTimer = 0; // 10 Hz distance label cadence
  private navLastBearing = 0; // held while RE-ROUTING so the arrow never snaps
  private navVisibleNow = { arrow: false, compass: false, label: false };

  constructor(container: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div id="objective" class="panel"><div class="title">STANDBY</div><div class="sub"></div></div>
      <div id="timerbox"></div>
      <div id="hint"></div>
      <canvas id="radar" width="170" height="170"></canvas>
      <canvas id="selfdoll" width="100" height="112"></canvas>
      <div id="targetwrap"><div class="nm"></div><canvas id="targetdoll" width="100" height="112"></canvas></div>
      <div id="heatwrap" class="panel"><div class="redline"></div><div class="amberline"></div><div id="heatbar"></div><div id="heatlabel">HEAT</div></div>
      <div id="throttle" class="panel"><div id="throtfill"></div><div class="tick zero" style="top:33%"></div><div id="throtlabel">THR</div></div>
      <div id="weapons" class="panel"></div>
      <div id="crosshair"><svg width="44" height="44"><circle cx="22" cy="22" r="14" fill="none" stroke="rgba(126,230,176,.8)" stroke-width="1"/><line x1="22" y1="2" x2="22" y2="12" stroke="rgba(126,230,176,.8)"/><line x1="22" y1="32" x2="22" y2="42" stroke="rgba(126,230,176,.8)"/><line x1="2" y1="22" x2="12" y2="22" stroke="rgba(126,230,176,.8)"/><line x1="32" y1="22" x2="42" y2="22" stroke="rgba(126,230,176,.8)"/></svg></div>
      <div id="leadpip"></div>
      <div id="objmark"><span class="arr">▲</span><span class="d"></span></div>
      <canvas id="navcompass" width="380" height="34"></canvas>
      <div id="navarrow">
        <svg width="46" height="46" viewBox="-23 -23 46 46">
          <g class="g-chev"><path d="M -13 9 L 0 -13 L 13 9 L 0 3 Z"/></g>
          <g class="g-behind"><path class="ln" d="M -12 9 L 0 -3 L 12 9"/><path class="ln" d="M -12 -1 L 0 -13 L 12 -1"/></g>
          <g class="g-check"><path class="ln" d="M -11 1 L -3 9 L 13 -10"/></g>
          <g class="g-ring"><circle class="ln" r="11" stroke-dasharray="10 7"/></g>
        </svg>
        <span class="d"></span>
        <span class="lbl"></span>
      </div>
      <div id="navwp"><span class="nm"></span><span class="d"></span></div>
      <div id="alert"></div>
      <div id="subtitles"></div>
      <div id="damageflash"></div>
      <div id="bootveil"></div>
      <div id="redeploy"></div>
      <div id="endscreen"><div class="card"><h1 id="endtitle"></h1><div id="endbody"></div><button id="endbtn">REFIT &amp; RELAUNCH</button></div></div>
    `;
    container.appendChild(this.root);

    this.radarCanvas = this.root.querySelector('#radar')!;
    this.selfCanvas = this.root.querySelector('#selfdoll')!;
    this.targetCanvas = this.root.querySelector('#targetdoll')!;
    for (const id of ['objective', 'heatbar', 'heatwrap', 'throtfill', 'weapons', 'alert', 'subtitles', 'damageflash', 'bootveil', 'endscreen', 'endtitle', 'endbody', 'targetwrap', 'leadpip', 'objmark', 'timerbox', 'hint', 'redeploy', 'navarrow', 'navwp']) {
      this.els[id] = this.root.querySelector(`#${id}`)!;
    }
    this.navCompassCanvas = this.root.querySelector('#navcompass')!;
    this.navArrowSvg = this.els.navarrow.querySelector('svg')!;
    this.navDistEl = this.els.navarrow.querySelector('.d')!;
    this.navLblEl = this.els.navarrow.querySelector('.lbl')!;
    this.navWpNmEl = this.els.navwp.querySelector('.nm')!;
    this.navWpDEl = this.els.navwp.querySelector('.d')!;
  }

  setObjective(title: string, sub: string): void {
    this.els.objective.querySelector('.title')!.textContent = title;
    this.els.objective.querySelector('.sub')!.textContent = sub;
  }

  subtitle(speaker: string, text: string, seconds: number): void {
    this.els.subtitles.innerHTML = `<span class="speaker">${speaker}:</span> ${text}`;
    this.subtitleTimer = seconds;
  }

  damageFlash(): void {
    const el = this.els.damageflash;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 130);
  }

  bootReveal(): void {
    this.els.bootveil.style.opacity = '0';
  }

  showEnd(phase: MissionPhase, salvage: { name: string; cause: string; yield: number }[],
    opts: { title?: string; label: string; onClick: () => void; note?: string; scrip?: number }): void {
    const win = phase === 'complete';
    this.els.endtitle.textContent = opts.title ?? (win ? 'MISSION COMPLETE' : 'MISSION FAILED');
    (this.els.endtitle as HTMLElement).style.color = win ? '#ffb347' : '#ff5533';
    let body = '';
    if (win) {
      body += '<table><tr><th>SALVAGE</th><th>KILL CONDITION</th><th>YIELD</th></tr>';
      if (!salvage.length) body += '<tr><td colspan="3">— none recovered —</td></tr>';
      for (const s of salvage) {
        body += `<tr><td>${s.name}</td><td>${s.cause === 'legs' ? 'LEGGED — intact' : s.cause === 'head' ? 'HEADSHOT — intact' : s.cause === 'ammo' ? 'AMMO COOK-OFF — scrap' : 'CORED'}</td><td>${Math.round(s.yield * 100)}%</td></tr>`;
      }
      body += '</table>';
      if (opts.scrip !== undefined) {
        body += `<div style="font-size:13px;color:#ffb347;letter-spacing:2px;margin-bottom:10px">SCRIP EARNED: +${opts.scrip}</div>`;
      }
      body += '<div style="font-size:11px;color:rgba(126,230,176,.6)">Leg or headshot kills preserve the chassis. Cook-offs leave scrap.</div>';
    } else {
      body = '<div style="font-size:13px;color:rgba(200,230,215,.7);margin-bottom:14px">The Compact recovers your ejection pod under fire.</div>';
    }
    if (opts.note) {
      body += `<div style="font-size:12px;color:rgba(200,230,215,.75);margin-top:12px;max-width:420px">${opts.note}</div>`;
    }
    this.els.endbody.innerHTML = body;
    const btn = this.root.querySelector('#endbtn') as HTMLButtonElement;
    btn.textContent = opts.label;
    btn.onclick = opts.onClick;
    (this.els.endscreen as HTMLElement).style.display = 'flex';
  }

  private redeployKeys: ((e: KeyboardEvent) => void) | null = null;

  /**
   * Multiplayer deck picker: after destruction, choose the next unspent deck
   * frame. Clickable buttons plus 1–6 hotkeys (works under pointer lock).
   * Bay chips are icon+text — spent frames read EXPENDED, never color alone.
   */
  showRedeploy(
    choices: Array<{ iid: string; label: string; spent: boolean }>,
    subtitle: string,
    onPick: (iid: string) => void,
  ): void {
    const el = this.els.redeploy as HTMLElement;
    el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:40;background:rgba(3,8,6,.72);font-family:inherit;';
    const rows = choices.map((c, i) =>
      `<button data-iid="${c.iid}" ${c.spent ? 'disabled' : ''} style="display:block;width:100%;box-sizing:border-box;margin:4px 0;padding:9px 14px;background:none;border:1px solid ${c.spent ? 'rgba(126,230,176,.25)' : '#7ee6b0'};color:${c.spent ? 'rgba(126,230,176,.35)' : '#7ee6b0'};font-family:inherit;font-size:12px;letter-spacing:2px;cursor:${c.spent ? 'default' : 'pointer'};text-align:left;">${i + 1}. ${c.label}${c.spent ? ' — ⛔ EXPENDED' : ''}</button>`).join('');
    el.innerHTML = `<div style="border:1px solid rgba(255,179,71,.5);background:rgba(8,16,13,.96);padding:18px 24px;min-width:340px;" role="dialog" aria-label="Select next deck frame">
      <div style="color:#ffb347;font-size:12px;letter-spacing:3px;margin-bottom:4px;">MACHINE DOWN — SELECT NEXT FRAME</div>
      <div style="color:rgba(126,230,176,.65);font-size:10px;letter-spacing:1px;margin-bottom:10px;">${subtitle}</div>
      ${rows}</div>`;
    for (const b of el.querySelectorAll<HTMLButtonElement>('button')) {
      b.onclick = () => { if (!b.disabled) onPick(b.dataset.iid!); };
    }
    this.hideRedeployKeys();
    this.redeployKeys = (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= choices.length && !choices[n - 1].spent) onPick(choices[n - 1].iid);
    };
    window.addEventListener('keydown', this.redeployKeys);
  }

  private hideRedeployKeys(): void {
    if (this.redeployKeys) {
      window.removeEventListener('keydown', this.redeployKeys);
      this.redeployKeys = null;
    }
  }

  hideRedeploy(): void {
    const el = this.els.redeploy as HTMLElement;
    el.style.cssText = 'display:none;';
    el.innerHTML = '';
    this.hideRedeployKeys();
  }

  /** Deck expended under the spectate rule: persistent banner, no respawn. */
  showSpectate(text: string): void {
    this.hideRedeployKeys();
    const el = this.els.redeploy as HTMLElement;
    el.style.cssText = 'position:fixed;top:14%;left:50%;transform:translateX(-50%);z-index:40;pointer-events:none;font-family:inherit;';
    el.innerHTML = `<div style="border:1px solid rgba(255,85,51,.6);background:rgba(20,8,6,.9);padding:10px 22px;color:#ff8873;font-size:12px;letter-spacing:3px;">${text}</div>`;
  }

  /** HUD highlight service: soft amber pulse on named elements (tutorial).
   *  The HUD owns the effect; reduced-motion gets a static ring. */
  highlight(ids: string[]): void {
    const MAP: Record<string, string> = {
      throttle: '#throttle', heat: '#heatwrap', radar: '#radar',
      target: '#targetwrap', weapons: '#weapons', selfdoll: '#selfdoll',
      compass: '#navcompass',
    };
    for (const sel of Object.values(MAP)) {
      this.root.querySelector(sel)?.classList.remove('tut-hi');
    }
    for (const id of ids) {
      const sel = MAP[id];
      if (sel) this.root.querySelector(sel)?.classList.add('tut-hi');
    }
  }

  /** Input-glyph prompt line (tutorial hint escalation); '' hides it. */
  setHint(text: string): void {
    const el = this.els.hint as HTMLElement;
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
  }

  /** Mission countdown (launch timers etc.); null hides it. */
  setTimer(seconds: number | null, label: string): void {
    const el = this.els.timerbox as HTMLElement;
    if (seconds === null) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const s = Math.max(0, Math.ceil(seconds));
    el.textContent = `${label} ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('critical', s <= 60);
  }

  setAlert(text: string): void {
    if (text === this.alertText) return;
    this.alertText = text;
    this.els.alert.textContent = text;
    (this.els.alert as HTMLElement).style.display = text ? 'block' : 'none';
  }

  update(dt: number, player: Mech, target: Mech | null, subtarget: ZoneId | null,
    mechs: Mech[], objective: THREE.Vector3 | null, camera: THREE.PerspectiveCamera, leadPoint: THREE.Vector3 | null,
    nav: NavView | null = null, navPrefs: NavPrefs | null = null): void {
    const navActive = !!(nav && nav.active);

    // subtitles fade
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) this.els.subtitles.textContent = '';
    }

    // heat
    const heatFrac = Math.min(1, player.heat / player.heatCap);
    this.els.heatbar.style.height = `${heatFrac * 232}px`;
    this.els.heatbar.style.background = heatFrac > 0.8 ? '#ff5533' : heatFrac > 0.55 ? '#ffb347' : '#39d98a';

    // alerts
    if (player.shutdown) this.setAlert('EMERGENCY SHUTDOWN');
    else if (player.overrideHeld && player.heat > player.heatCap * 0.95) this.setAlert('OVERRIDE — CORE DAMAGE');
    else if (heatFrac > 0.85) this.setAlert('HEAT CRITICAL');
    else this.setAlert('');

    // throttle ladder: -0.5..1 mapped to 200px, zero line at 33% from top
    const t = player.throttle;
    const zeroY = 0.33 * 192 + 4;
    if (t >= 0) {
      const h = t * (zeroY - 4) / 1 * 1.0;
      this.els.throtfill.style.top = `${zeroY - h}px`;
      this.els.throtfill.style.height = `${h}px`;
    } else {
      const h = (-t / 0.5) * (192 - zeroY);
      this.els.throtfill.style.top = `${zeroY}px`;
      this.els.throtfill.style.height = `${h}px`;
    }

    // weapons panel
    const rows = player.weapons.map((w) => {
      const zoneGone = player.zones[w.zone].destroyed;
      const cls = w.destroyed || zoneGone ? 'dead' : w.cooldown > 0 ? 'cd' : 'rdy';
      const state = w.destroyed || zoneGone ? 'LOST' : w.cooldown > 0 ? w.cooldown.toFixed(1) : 'RDY';
      const ammo = w.ammo >= 0 ? ` ${w.ammo}` : '';
      return `<div class="w"><span class="nm">[${w.group}] ${w.def.name}</span><span class="${cls}">${state}${ammo}</span></div>`;
    });
    rows.push(`<div class="w"><span class="nm">JETS</span><span class="rdy">${Math.round(player.jumpFuel * 100)}%</span></div>`);
    rows.push(`<div class="w"><span class="nm">COOLANT</span><span class="${player.coolantFlushes ? 'rdy' : 'dead'}">${player.coolantFlushes ? 'ARMED' : 'SPENT'}</span></div>`);
    this.els.weapons.innerHTML = rows.join('');

    // target readout
    (this.els.targetwrap as HTMLElement).style.display = target ? 'block' : 'none';
    if (target) {
      this.els.targetwrap.querySelector('.nm')!.textContent =
        `${target.def.name.toUpperCase()} · ${Math.round(target.pos.distanceTo(player.pos))}m${subtarget ? ` → ${ZONE_NAMES[subtarget]}` : ''}`;
      this.drawDoll(this.targetCanvas, target, subtarget);
    }
    this.drawDoll(this.selfCanvas, player, null);
    this.drawRadar(player, mechs, objective, nav);
    // PATHLIGHT owns guidance while a route is active — never two arrows,
    // never two beams pointing at the same goal
    this.drawObjectiveMarker(player, navActive ? null : objective, camera);
    this.drawNav(dt, player, camera, nav, navPrefs);
    this.drawEnemyBars(mechs, camera);

    // ballistic lead pip
    if (leadPoint && target) {
      const p = leadPoint.clone().project(camera);
      if (p.z < 1) {
        const el = this.els.leadpip as HTMLElement;
        el.style.display = 'block';
        el.style.left = `${(p.x * 0.5 + 0.5) * window.innerWidth}px`;
        el.style.top = `${(-p.y * 0.5 + 0.5) * window.innerHeight}px`;
      } else (this.els.leadpip as HTMLElement).style.display = 'none';
    } else (this.els.leadpip as HTMLElement).style.display = 'none';
  }

  /** Compact opponent markers: name and overall hull integrity over every
   *  living Directorate machine that is on screen. Full paper dolls stay in
   *  the self and selected-target readouts so fixed-size diagrams never cover
   *  distant mechs. */
  private drawEnemyBars(mechs: Mech[], camera: THREE.PerspectiveCamera): void {
    const seen = new Set<number>();
    for (const m of mechs) {
      if (m.team !== 'directorate') continue;
      let bar = this.enemyBars.get(m.id);
      if (!m.alive) {
        if (bar) bar.style.display = 'none';
        continue;
      }
      seen.add(m.id);
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'ebar';
        bar.innerHTML = `<div class="nm"></div><div class="bg"><div class="f"></div></div>`;
        (bar.querySelector('.nm') as HTMLElement).textContent = m.def.name.toUpperCase();
        this.root.appendChild(bar);
        this.enemyBars.set(m.id, bar);
      }
      let cur = 0, max = 0;
      for (const z of Object.values(m.zones)) {
        cur += z.armor + z.structure;
        max += z.armorMax + z.structureMax;
      }
      const frac = max > 0 ? cur / max : 0;
      const height = 7 + m.def.tons * 0.08; // same formula as the mech factory
      const p = new THREE.Vector3(m.pos.x, m.pos.y + height + 3, m.pos.z).project(camera);
      if (p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) {
        bar.style.display = 'none';
        continue;
      }
      bar.style.display = 'block';
      bar.style.left = `${(p.x * 0.5 + 0.5) * window.innerWidth}px`;
      bar.style.top = `${(-p.y * 0.5 + 0.5) * window.innerHeight}px`;
      const fill = bar.querySelector('.f') as HTMLElement;
      fill.style.width = `${Math.round(frac * 100)}%`;
      fill.style.background = frac > 0.6 ? '#39d98a' : frac > 0.3 ? '#ffb347' : '#ff5533';
    }
    // drop bars for mechs that no longer exist
    for (const [id, bar] of this.enemyBars) {
      if (!mechs.some((m) => m.id === id)) {
        bar.remove();
        this.enemyBars.delete(id);
      }
    }
    void seen;
  }

  /** Screen-space nav marker: over the objective when visible, clamped to the
   *  screen edge as a direction arrow (with distance) when it isn't. */
  private drawObjectiveMarker(player: Mech, objective: THREE.Vector3 | null, camera: THREE.PerspectiveCamera): void {
    const el = this.els.objmark as HTMLElement;
    if (!objective) { el.style.display = 'none'; return; }
    const dist = Math.round(Math.hypot(objective.x - player.pos.x, objective.z - player.pos.z));
    const p = objective.clone().add(new THREE.Vector3(0, 26, 0)).project(camera);
    let x = p.x, y = p.y;
    const behind = p.z > 1;
    if (behind) { x = -x; y = -y; }
    const offscreen = behind || Math.abs(x) > 0.88 || Math.abs(y) > 0.82;
    if (offscreen) {
      const m = Math.max(Math.abs(x) / 0.88, Math.abs(y) / 0.82, 1e-6);
      x /= m; y /= m;
    }
    el.style.display = 'block';
    el.style.left = `${(x * 0.5 + 0.5) * window.innerWidth}px`;
    el.style.top = `${(-y * 0.5 + 0.5) * window.innerHeight}px`;
    const arrow = el.querySelector('.arr') as HTMLElement;
    // ▲ points up at 0°; when clamped, rotate it to point toward the objective
    arrow.style.transform = offscreen
      ? `rotate(${Math.atan2(x, y) * 180 / Math.PI}deg)`
      : 'rotate(180deg)';
    (el.querySelector('.d') as HTMLElement).textContent = `${dist}m`;
  }

  private navTmp = new THREE.Vector3();

  /** PATHLIGHT test hook: which guidance layers the HUD showed this frame. */
  navDebug(): { arrow: boolean; compass: boolean; label: boolean; state: string } {
    return { ...this.navVisibleNow, state: this.navStateClass };
  }

  /**
   * PATHLIGHT L3 (steering arrow around the reticle + off-screen clamp) and
   * the L2 beacon label. Steering uses legError (how to turn the LEGS); the
   * off-screen clamp is camera-relative (where to LOOK) — conflating the two
   * frames is the genre's classic failure mode, so they never mix here.
   * All per-frame writes are transform/class/opacity; text updates at 10 Hz.
   */
  private drawNav(dt: number, player: Mech, camera: THREE.PerspectiveCamera,
    nav: NavView | null, prefs: NavPrefs | null): void {
    const arrowEl = this.els.navarrow as HTMLElement;
    const wpEl = this.els.navwp as HTMLElement;
    const active = !!(nav && nav.active);
    const showCompass = active && !!nav && nav.layers.compass && (prefs?.compass ?? true);
    this.navCompassCanvas.style.display = showCompass ? 'block' : 'none';
    if (showCompass && nav) this.drawNavCompass(player, nav);
    this.navVisibleNow.compass = showCompass;
    if (!active || !nav) {
      arrowEl.style.display = 'none';
      wpEl.style.display = 'none';
      this.navVisibleNow.arrow = false;
      this.navVisibleNow.label = false;
      this.navStateClass = '';
      return;
    }
    const rm = prefs ? navReducedMotion(prefs) : false;
    const hc = prefs?.highContrast ?? false;
    const scale = prefs?.scale ?? 1;
    this.root.style.setProperty('--navscale', String(scale));

    const st = nav.state;
    // hold the last valid bearing while RECALCULATING — never snap wildly
    if (st !== 'rerouting') this.navLastBearing = nav.legErrorRad;
    // reduced motion stiffens the spring (the rotation itself IS information)
    const shown = stepAngleSpring(this.navSpring, this.navLastBearing, dt,
      rm ? 0.05 : 0.12, (rm ? 3 : 6) * DEG);

    // state presentation swap — six per route leg at most
    const cls = `st-${st}${hc ? ' hc' : ''}${rm ? ' rm' : ''}`;
    if (this.navStateClass !== cls) {
      arrowEl.className = cls;
      this.navStateClass = cls;
      this.navLblEl.textContent =
        st === 'behind' ? navString('hud.nav.state.behind')
          : st === 'rerouting' ? navString('hud.nav.state.rerouting')
            : st === 'arrived' ? navString('hud.nav.state.arrived') : '';
    }

    // 10 Hz distance cadence; above 100 m round to 5 m
    this.navDistTimer -= dt;
    if (this.navDistTimer <= 0) {
      this.navDistTimer = 0.1;
      const d = nav.distance;
      const txt = `${d > 100 ? Math.round(d / 5) * 5 : Math.round(d)}m`;
      if (this.navDistEl.textContent !== txt) this.navDistEl.textContent = txt;
      if (st !== 'arrived' && this.navWpDEl.textContent !== txt) this.navWpDEl.textContent = txt;
      const nm = navString(nav.wpNameKey);
      if (this.navWpNmEl.textContent !== nm) this.navWpNmEl.textContent = nm;
    }
    if (st === 'arrived') this.navWpDEl.textContent = navString('hud.nav.state.arrived');

    const W = window.innerWidth, H = window.innerHeight;

    // beacon anchor projection (behind-camera sign guard, the §2.6 bug)
    const p = this.navTmp.set(nav.wpX, nav.wpY + nav.beaconHeight * 0.55, nav.wpZ).project(camera);
    let nx = p.x, ny = p.y;
    const behindCam = p.z > 1;
    if (behindCam) { nx = -nx; ny = -ny; }
    const offscreenNow = st === 'offscreen';
    const qm = Math.max(Math.abs(nx) / 0.84, Math.abs(ny) / 0.84, 1e-6);
    const qx = nx / qm, qy = ny / qm;

    const arrowPref = prefs?.arrow ?? 'always';
    const arrowVisible = nav.layers.arrow && arrowPref !== 'off'
      && (arrowPref === 'always' || st === 'offscreen' || st === 'behind');
    if (!arrowVisible) {
      arrowEl.style.display = 'none';
    } else {
      arrowEl.style.display = 'block';
      if (offscreenNow) {
        // clamp onto the safe rect inset 8% from the edges — corners are legal
        arrowEl.style.left = `${(qx * 0.5 + 0.5) * W}px`;
        arrowEl.style.top = `${(-qy * 0.5 + 0.5) * H}px`;
        this.navArrowSvg.style.transform = `rotate(${Math.atan2(qx, qy) * 180 / Math.PI}deg)`;
      } else {
        // reticle ring, radius 140 px × scale; +error = pilot's LEFT, and the
        // chevron points outward along the bearing. Never occludes the reticle.
        const R = 140 * scale;
        arrowEl.style.left = `${W / 2 - Math.sin(shown) * R}px`;
        arrowEl.style.top = `${H / 2 - Math.cos(shown) * R}px`;
        this.navArrowSvg.style.transform = `rotate(${-shown * 180 / Math.PI}deg)`;
      }
    }
    this.navVisibleNow.arrow = arrowVisible;

    // beacon label: at the projected column when on screen; in OFF-SCREEN it
    // attaches to the clamped arrow instead
    if (nav.layers.beacon && (prefs?.beacon ?? true)) {
      if (offscreenNow) {
        wpEl.style.display = 'block';
        wpEl.style.left = `${(qx * 0.5 + 0.5) * W - qx * 52}px`;
        wpEl.style.top = `${(-qy * 0.5 + 0.5) * H + qy * 52 + 16}px`;
      } else if (!behindCam && Math.abs(nx) < 1.02 && Math.abs(ny) < 1.02) {
        wpEl.style.display = 'block';
        wpEl.style.left = `${(nx * 0.5 + 0.5) * W}px`;
        wpEl.style.top = `${(-ny * 0.5 + 0.5) * H}px`;
      } else {
        wpEl.style.display = 'none';
      }
    } else {
      wpEl.style.display = 'none';
    }
    this.navVisibleNow.label = wpEl.style.display !== 'none';
    wpEl.classList.toggle('hc', hc);
  }

  /**
   * PATHLIGHT L4 — the compass strip. Two pips, clearly differentiated:
   * filled diamond = destination bearing, hollow chevron = current leg heading
   * (shown when look and legs diverge > 20°). Aligning them is the mental
   * model. Display headings increase turning right; the sim's +yaw is left.
   */
  private drawNavCompass(player: Mech, nav: NavView): void {
    const g = this.navCompassCanvas.getContext('2d')!;
    const W = this.navCompassCanvas.width, H = this.navCompassCanvas.height;
    const C = W / 2;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,14,12,.5)';
    g.fillRect(0, 0, W, H - 12);
    g.strokeStyle = 'rgba(63,216,240,.35)';
    g.strokeRect(0.5, 0.5, W - 1, H - 13);
    const facing = player.legYaw + player.torsoYaw;
    const pxPerRad = W / (120 * DEG); // ±60° window
    const relX = (bearing: number): number => C - wrapPi(bearing - facing) * pxPerRad;
    g.strokeStyle = 'rgba(63,216,240,.5)';
    g.fillStyle = 'rgba(63,216,240,.75)';
    g.font = '9px "Courier New", monospace';
    g.textAlign = 'center';
    for (let d = 0; d < 360; d += 15) {
      const x = relX(-d * DEG); // display heading d ↔ world yaw −d
      if (x < 6 || x > W - 6) continue;
      const major = d % 45 === 0;
      g.beginPath(); g.moveTo(x, 1); g.lineTo(x, major ? 9 : 5); g.stroke();
      if (major) g.fillText(String(d).padStart(3, '0'), x, 19);
    }
    // lubber line — where you look
    g.strokeStyle = 'rgba(126,230,176,.9)';
    g.beginPath(); g.moveTo(C, 0); g.lineTo(C, H - 12); g.stroke();
    // destination pip: filled cyan diamond (clamps to the strip edge)
    const dx = Math.max(7, Math.min(W - 7, relX(nav.wpBearingRad)));
    g.fillStyle = '#3fd8f0';
    g.beginPath();
    g.moveTo(dx, 3); g.lineTo(dx + 5, 10); g.lineTo(dx, 17); g.lineTo(dx - 5, 10);
    g.closePath(); g.fill();
    // leg-heading pip: hollow chevron
    if (Math.abs(wrapPi(facing - player.legYaw)) > 20 * DEG) {
      const lx = Math.max(7, Math.min(W - 7, relX(player.legYaw)));
      g.strokeStyle = '#3fd8f0';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(lx - 5, 16); g.lineTo(lx, 7); g.lineTo(lx + 5, 16); g.stroke();
      g.lineWidth = 1;
    }
    // numeric bearing of the destination
    const brg = ((Math.round(-nav.wpBearingRad / DEG) % 360) + 360) % 360;
    g.fillStyle = 'rgba(63,216,240,.9)';
    g.fillText(`${navString('hud.nav.compass.brg')} ${String(brg).padStart(3, '0')}`, C, H - 2);
  }

  private drawDoll(canvas: HTMLCanvasElement, mech: Mech, highlight: ZoneId | null, scale = 1): void {
    const g = canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.setTransform(scale, 0, 0, scale, 0, 0);
    for (const [zone, x, y, w, h] of DOLL) {
      const z = mech.zones[zone];
      const frac = z.armorMax ? z.armor / z.armorMax : 0;
      g.fillStyle = zoneColor(frac, z.destroyed);
      g.fillRect(x, y, w, h);
      if (!z.destroyed && z.structure < z.structureMax) {
        g.fillStyle = 'rgba(255,85,51,.5)';
        g.fillRect(x + 2, y + 2, Math.max(0, w - 4) * (1 - z.structure / z.structureMax), Math.max(0, h - 4));
      }
      g.strokeStyle = zone === highlight ? '#fff' : 'rgba(6,10,8,.9)';
      g.lineWidth = zone === highlight ? 2 : 1;
      g.strokeRect(x + 0.5, y + 0.5, w, h);
    }
  }

  private drawRadar(player: Mech, mechs: Mech[], objective: THREE.Vector3 | null, nav: NavView | null = null): void {
    const g = this.radarCanvas.getContext('2d')!;
    const W = this.radarCanvas.width, C = W / 2, RANGE = 900;
    g.clearRect(0, 0, W, W);
    g.fillStyle = 'rgba(8,14,12,.55)';
    g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(126,230,176,.4)';
    g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(C, C, (C - 2) / 2, 0, Math.PI * 2); g.stroke();

    const facing = player.legYaw + player.torsoYaw;
    const plot = (wx: number, wz: number): [number, number, number] => {
      const dx = wx - player.pos.x, dz = wz - player.pos.z;
      const dist = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz) - facing;
      const r = Math.min(1, dist / RANGE) * (C - 6);
      // +bearing = to the pilot's LEFT (same handedness as the camera), so it
      // must plot on the left half of the ring
      return [C - Math.sin(ang) * r, C - Math.cos(ang) * r, dist];
    };

    // torso-facing wedge
    g.strokeStyle = 'rgba(126,230,176,.25)';
    g.beginPath(); g.moveTo(C, C); g.lineTo(C, 4); g.stroke();

    for (const m of mechs) {
      if (m === player) continue;
      const [x, y] = plot(m.pos.x, m.pos.z);
      if (!m.alive) {
        g.fillStyle = 'rgba(150,150,150,.5)';
        g.fillRect(x - 2, y - 2, 4, 4);
        continue;
      }
      g.fillStyle = m.team === 'directorate' ? '#ff5533' : '#53a8d7';
      g.beginPath();
      g.moveTo(x, y - 4); g.lineTo(x + 3.5, y + 3); g.lineTo(x - 3.5, y + 3);
      g.closePath(); g.fill();
    }
    if (nav && nav.active) {
      // PATHLIGHT waypoint: cyan diamond (nav is cyan; amber stays warnings)
      const [x, y] = plot(nav.wpX, nav.wpZ);
      g.fillStyle = '#3fd8f0';
      g.beginPath();
      g.moveTo(x, y - 4.5); g.lineTo(x + 4.5, y); g.lineTo(x, y + 4.5); g.lineTo(x - 4.5, y);
      g.closePath(); g.fill();
    } else if (objective) {
      const [x, y] = plot(objective.x, objective.z);
      g.strokeStyle = '#ffb347';
      g.lineWidth = 1.5;
      g.strokeRect(x - 3.5, y - 3.5, 7, 7);
      g.lineWidth = 1;
    }
    // player wedge center
    g.fillStyle = '#7ee6b0';
    g.beginPath(); g.moveTo(C, C - 5); g.lineTo(C + 4, C + 4); g.lineTo(C - 4, C + 4); g.closePath(); g.fill();
  }
}
