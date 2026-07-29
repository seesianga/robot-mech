import { BINDS, isBound, labelOf, resolveBindTokens } from '../engine/bindings';
import { btString, type BtEvent, type BtRail, type BtSummary } from '../sim/basictraining';

/**
 * BASIC TRAINING prompt layer: bottom-center prompt card with device-correct
 * glyph chips (fill states for held/analog inputs), sub-checklists, a slim
 * top progress rail (phases A–H with per-step ticks), the hold-H cheat sheet,
 * the Esc pause menu, and the completion summary card.
 *
 * Chip fill and checklist pips are driven by direct DOM writes — no innerHTML
 * churn per frame. All prompts work as text + glyph with sound off; glyphs are
 * shape + label, never color alone; pulse effects respect reduced-motion.
 */

const CSS = `
#btlayer { position: fixed; inset: 0; pointer-events: none; z-index: 6; font-family: 'Courier New', monospace; }
#btrail { position: absolute; top: 64px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px;
  background: rgba(8,14,12,.55); border: 1px solid rgba(126,230,176,.25); border-radius: 3px; padding: 4px 10px; }
#btrail .ph { display: flex; align-items: center; gap: 3px; }
#btrail .ph b { font-size: 10px; color: rgba(126,230,176,.6); letter-spacing: 1px; font-weight: normal; }
#btrail .ph.cur b { color: #ffb347; }
#btrail .tick { width: 7px; height: 7px; border: 1px solid rgba(126,230,176,.5); border-radius: 1px; font-size: 6px;
  line-height: 7px; text-align: center; color: #06110c; }
#btrail .tick.done { background: #7ee6b0; border-color: #7ee6b0; }
#btrail .tick.skipped { background: rgba(255,179,71,.55); border-color: #ffb347; }
#btrail .tick.auto { background: rgba(126,230,176,.15); border-style: dashed; }
#btrail .tick.jumped { background: rgba(126,230,176,.3); border-color: rgba(126,230,176,.3); }
#btrail .tick.active { border-color: #ffb347; animation: btblink 1s steps(2) infinite; }
#btcard { position: absolute; bottom: 116px; left: 50%; transform: translateX(-50%); text-align: center;
  background: rgba(8,14,12,.72); border: 1px solid rgba(126,230,176,.4); border-radius: 4px; padding: 12px 22px 10px;
  min-width: 420px; max-width: 760px; }
#btcard.confirmed { border-color: #7ee6b0; }
#btline { font-size: 15px; color: #e8f4ec; line-height: 2.1; }
#btcaption { font-size: 11px; color: rgba(200,230,215,.65); margin-top: 3px; letter-spacing: 1px; }
#btchecks { display: flex; gap: 14px; justify-content: center; margin-top: 7px; }
#btchecks .chk { font-size: 11px; letter-spacing: 1px; color: rgba(126,230,176,.55); }
#btchecks .chk .box { display: inline-block; width: 11px; height: 11px; border: 1px solid rgba(126,230,176,.6);
  border-radius: 2px; margin-right: 4px; vertical-align: -1px; text-align: center; line-height: 11px; font-size: 9px; color: #06110c; }
#btchecks .chk.on { color: #7ee6b0; }
#btchecks .chk.on .box { background: #7ee6b0; border-color: #7ee6b0; }
#btcheckmark { position: absolute; top: -14px; right: -14px; width: 30px; height: 30px; border-radius: 50%;
  background: #7ee6b0; color: #06110c; font-size: 19px; line-height: 30px; text-align: center; opacity: 0;
  transform: scale(.4); }
#btcard.confirmed #btcheckmark { animation: btstamp .35s ease-out forwards; }
#btskipbar { position: absolute; bottom: 6px; right: 10px; font-size: 9px; letter-spacing: 1px; color: rgba(126,230,176,.45); }
#btskipbar .fill { display: inline-block; width: 40px; height: 5px; border: 1px solid rgba(255,179,71,.5); margin-left: 6px; vertical-align: 1px; }
#btskipbar .fill i { display: block; height: 100%; width: 0%; background: #ffb347; }
.btchip { display: inline-block; position: relative; min-width: 30px; padding: 3px 9px 2px; margin: 0 4px;
  border: 1px solid #7ee6b0; border-bottom-width: 3px; border-radius: 4px; background: rgba(10,20,16,.9);
  color: #7ee6b0; font-size: 14px; letter-spacing: 1px; vertical-align: -2px; overflow: hidden; }
.btchip i.fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0%; background: rgba(126,230,176,.28); }
.btchip b { position: relative; font-weight: normal; }
.btchip.unbound { border-color: #ffb347; color: #ffb347; font-size: 10px; }
#btcard.hint1 .btchip { animation: btpulse 1s ease-in-out infinite; }
#btcard.hint2 .btchip { animation: btghost 1.1s ease-in-out infinite; }
@keyframes btpulse { 50% { transform: scale(1.14); box-shadow: 0 0 10px rgba(255,179,71,.6); } }
@keyframes btghost { 0%, 100% { transform: translateY(0); filter: none; }
  30% { transform: translateY(3px); filter: brightness(1.9); border-bottom-width: 1px; }
  55% { transform: translateY(0); filter: none; } }
@keyframes btstamp { to { opacity: 1; transform: scale(1); } }
@keyframes btblink { 50% { opacity: .3; } }
#btcheat { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); display: none;
  background: rgba(8,14,12,.92); border: 1px solid rgba(126,230,176,.5); border-radius: 4px; padding: 16px 26px; min-width: 340px; }
#btcheat h3 { margin: 0 0 10px; font-size: 12px; letter-spacing: 2px; color: #ffb347; font-weight: normal; text-align: center; }
#btcheat .row { display: flex; justify-content: space-between; gap: 18px; font-size: 12px; color: #cfe; padding: 2px 0; }
#btmenu, #btsummary { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); display: none;
  pointer-events: auto; background: rgba(8,16,13,.96); border: 1px solid rgba(126,230,176,.5); border-radius: 4px;
  padding: 24px 34px; text-align: center; min-width: 360px; }
#btmenu h3, #btsummary h3 { margin: 0 0 16px; font-size: 16px; letter-spacing: 4px; color: #ffb347; font-weight: normal; }
#btlayer button { pointer-events: auto; background: none; border: 1px solid #7ee6b0; color: #7ee6b0;
  font-family: inherit; font-size: 12px; letter-spacing: 2px; padding: 8px 18px; cursor: pointer; margin: 4px; }
#btlayer button:hover { background: rgba(126,230,176,.15); }
#btlayer button.primary { border-color: #ffb347; color: #ffb347; }
#btlayer button.primary:hover { background: rgba(255,179,71,.15); }
#btsummary table { margin: 0 auto 14px; border-collapse: collapse; font-size: 12px; color: #cfe; }
#btsummary td { padding: 3px 12px; }
#btsummary td:first-child { color: rgba(126,230,176,.6); letter-spacing: 1px; text-align: right; }
#btsummary .phrow { margin: 8px 0 2px; display: none; }
#btsummary .phrow button { min-width: 34px; padding: 6px 8px; }
#btintro { position: absolute; top: 38%; left: 50%; transform: translate(-50%,-50%); font-size: 22px;
  letter-spacing: 8px; color: #7ee6b0; text-shadow: 0 0 14px rgba(126,230,176,.7); display: none; }
@media (prefers-reduced-motion: reduce) {
  #btcard.hint1 .btchip, #btcard.hint2 .btchip, #btrail .tick.active { animation: none; }
}
`;

export interface BtOverlayHooks {
  playSfx(id: string, volume?: number): void;
  highlight(ids: string[]): void;
  subtitle(text: string): void;
  onResume(): void;
  onSkipAll(): void;
  onSummary(action: 'replay' | 'campaign' | 'menu', phase?: string): void;
}

interface StepView {
  id: string;
  phase: string;
  prompt_key: string;
  caption_key?: string;
  hud_highlight?: string[];
  listen_actions?: string[];
  checklist?: { label_key: string }[];
}

export class BtOverlay {
  private root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private chips: HTMLElement[] = [];
  private checkEls: HTMLElement[] = [];
  private lastPhase = '';
  private curStep: StepView | null = null;
  private taught: string[] = [];
  private introTimer: ReturnType<typeof setTimeout>[] = [];
  private lastFill = -1;

  constructor(container: HTMLElement, private hooks: BtOverlayHooks) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.id = 'btlayer';
    this.root.innerHTML = `
      <div id="btrail"></div>
      <div id="btcard">
        <div id="btcheckmark">✓</div>
        <div id="btline"></div>
        <div id="btcaption"></div>
        <div id="btchecks"></div>
      </div>
      <div id="btskipbar"></div>
      <div id="btintro"></div>
      <div id="btcheat"><h3>${btString('tut.bt.ui.cheat_title')}</h3><div id="btcheatrows"></div></div>
      <div id="btmenu">
        <h3>${btString('tut.bt.ui.pause_title')}</h3>
        <div><button class="primary" id="btresume">${btString('tut.bt.ui.pause_resume')}</button></div>
        <div><button id="btskipall">${btString('tut.bt.ui.pause_skip')}</button></div>
      </div>
      <div id="btsummary">
        <h3>${btString('tut.bt.ui.summary_title')}</h3>
        <table>
          <tr><td>${btString('tut.bt.ui.summary_time')}</td><td id="btsumtime"></td></tr>
          <tr><td>${btString('tut.bt.ui.summary_hints')}</td><td id="btsumhints"></td></tr>
          <tr><td>${btString('tut.bt.ui.summary_phases')}</td><td id="btsumphases"></td></tr>
        </table>
        <div><button id="btsumreplay">${btString('tut.bt.ui.summary_replay')}</button></div>
        <div class="phrow" id="btsumphrow"></div>
        <div>
          <button class="primary" id="btsumcamp">${btString('tut.bt.ui.summary_campaign')}</button>
          <button id="btsummenu">${btString('tut.bt.ui.summary_menu')}</button>
        </div>
      </div>`;
    container.appendChild(this.root);
    for (const id of ['btrail', 'btcard', 'btline', 'btcaption', 'btchecks', 'btskipbar', 'btcheat', 'btcheatrows', 'btmenu', 'btsummary', 'btintro', 'btsumtime', 'btsumhints', 'btsumphases', 'btsumphrow']) {
      this.els[id] = this.root.querySelector(`#${id}`)!;
    }
    (this.root.querySelector('#btresume') as HTMLButtonElement).onclick = () => { this.showPause(false); hooks.onResume(); };
    (this.root.querySelector('#btskipall') as HTMLButtonElement).onclick = () => { this.showPause(false); hooks.onSkipAll(); };
    (this.root.querySelector('#btsumreplay') as HTMLButtonElement).onclick = () => {
      const row = this.els.btsumphrow;
      row.style.display = row.style.display === 'block' ? 'none' : 'block';
    };
    (this.root.querySelector('#btsumcamp') as HTMLButtonElement).onclick = () => hooks.onSummary('campaign');
    (this.root.querySelector('#btsummenu') as HTMLButtonElement).onclick = () => hooks.onSummary('menu');
    this.setSkipbarText();
  }

  private setSkipbarText(): void {
    this.els.btskipbar.innerHTML = `${resolveBindTokens(btString('tut.bt.ui.skipbar'))}<span class="fill"><i></i></span>`;
  }

  /** Router for TutorialDirector events. */
  handle(ev: BtEvent): void {
    switch (ev.t) {
      case 'step': this.showStep(ev.step as StepView); break;
      case 'progress': this.setProgress(ev.frac, ev.checks); break;
      case 'confirm': this.confirm(); break;
      case 'hint': this.hint(ev.level); break;
      case 'rail': this.renderRail(ev.rail); break;
      case 'taught': this.taught = ev.actions; this.renderCheat(); break;
      case 'powerup': this.powerUpIntro(); break;
      case 'done': this.showSummary(ev.summary); break;
    }
  }

  /** Prompt string → text nodes + glyph chips (device-correct, UNBOUND-aware). */
  private renderPrompt(el: HTMLElement, key: string): HTMLElement[] {
    el.textContent = '';
    const chips: HTMLElement[] = [];
    const raw = btString(key);
    const parts = raw.split(/(\{bind:[a-z0-9_]+\})/g);
    for (const part of parts) {
      const m = /^\{bind:([a-z0-9_]+)\}$/.exec(part);
      if (!m) {
        if (part) el.appendChild(document.createTextNode(part));
        continue;
      }
      const action = m[1];
      const chip = document.createElement('span');
      const bound = isBound(action);
      chip.className = bound ? 'btchip' : 'btchip unbound';
      chip.innerHTML = `<i class="fill"></i><b>${bound ? labelOf(action) : btString('tut.bt.ui.unbound')}</b>`;
      chip.title = BINDS[action]?.name ?? action;
      el.appendChild(chip);
      chips.push(chip);
    }
    return chips;
  }

  private showStep(step: StepView): void {
    this.curStep = step;
    const card = this.els.btcard;
    card.classList.remove('confirmed', 'hint1', 'hint2');
    card.style.display = 'block';
    // fill states drive the PROMPT's chips; caption chips render static
    this.chips = this.renderPrompt(this.els.btline, step.prompt_key);
    this.els.btcaption.style.display = step.caption_key ? 'block' : 'none';
    if (step.caption_key) this.renderPrompt(this.els.btcaption, step.caption_key);
    const checks = this.els.btchecks;
    checks.textContent = '';
    this.checkEls = [];
    for (const c of step.checklist ?? []) {
      const d = document.createElement('span');
      d.className = 'chk';
      d.innerHTML = `<span class="box"></span>${btString(c.label_key)}`;
      checks.appendChild(d);
      this.checkEls.push(d);
    }
    checks.style.display = this.checkEls.length ? 'flex' : 'none';
    this.hooks.highlight(step.hud_highlight ?? []);
    this.lastFill = -1;
    if (step.phase !== this.lastPhase) {
      if (this.lastPhase) this.hooks.playSfx('ui.bt.phase', 0.7);
      this.lastPhase = step.phase;
    }
  }

  private setProgress(frac: number, checks: boolean[]): void {
    const pct = Math.round(frac * 100);
    if (pct !== this.lastFill) {
      this.lastFill = pct;
      for (const chip of this.chips) {
        (chip.querySelector('i.fill') as HTMLElement).style.width = `${pct}%`;
      }
    }
    checks.forEach((on, i) => {
      const el = this.checkEls[i];
      if (!el) return;
      if (on !== el.classList.contains('on')) {
        el.classList.toggle('on', on);
        (el.querySelector('.box') as HTMLElement).textContent = on ? '✓' : '';
        if (on) this.hooks.playSfx('ui.bt.hint', 0.5); // sub-item tick
      }
    });
  }

  private confirm(): void {
    const card = this.els.btcard;
    card.classList.remove('hint1', 'hint2');
    card.classList.add('confirmed');
    for (const chip of this.chips) (chip.querySelector('i.fill') as HTMLElement).style.width = '100%';
    this.hooks.playSfx('ui.bt.confirm', 0.9); // THE chime — identical every step
  }

  private hint(level: 1 | 2): void {
    const card = this.els.btcard;
    card.classList.add(level === 1 ? 'hint1' : 'hint2');
    this.hooks.playSfx('ui.bt.hint', 0.6);
    if (level === 2 && this.curStep) {
      // ghost-input demo on the chips + the on-screen line, verbatim, in the subtitle strip
      this.hooks.subtitle(resolveBindTokens(btString(this.curStep.prompt_key)));
    }
  }

  private renderRail(rail: BtRail[]): void {
    const el = this.els.btrail;
    el.textContent = '';
    for (const ph of rail) {
      const d = document.createElement('span');
      d.className = `ph${ph.steps.includes('active') ? ' cur' : ''}`;
      d.title = ph.name;
      const ticks = ph.steps.map((s) =>
        `<span class="tick ${s}">${s === 'done' ? '✓' : s === 'skipped' ? '·' : ''}</span>`).join('');
      d.innerHTML = `<b>${ph.phase}</b>${ticks}`;
      el.appendChild(d);
    }
  }

  private renderCheat(): void {
    const rows = this.taught
      .filter((a) => isBound(a))
      .map((a) => `<div class="row"><span>${BINDS[a]?.name ?? a}</span><span class="btchip"><b>${labelOf(a)}</b></span></div>`)
      .join('');
    this.els.btcheatrows.innerHTML = rows || '<div class="row">—</div>';
  }

  /** A0 confirm: startup sound + HUD elements light up one by one with 1-word labels. */
  private powerUpIntro(): void {
    this.hooks.playSfx('sfx.startup', 1);
    const seq: [string, string][] = [['THROTTLE', 'throttle'], ['HEAT', 'heat'], ['RADAR', 'radar'], ['TARGET', 'target']];
    for (const t of this.introTimer) clearTimeout(t);
    this.introTimer = seq.map(([word, hudId], i) => setTimeout(() => {
      this.els.btintro.style.display = 'block';
      this.els.btintro.textContent = word;
      this.hooks.highlight([hudId]);
      this.hooks.playSfx('ui.bt.hint', 0.4);
      if (i === seq.length - 1) {
        setTimeout(() => {
          this.els.btintro.style.display = 'none';
          // hand the highlight back to whatever step is active by now
          this.hooks.highlight((this.curStep?.hud_highlight ?? []) as string[]);
        }, 700);
      }
    }, 400 + i * 650));
  }

  /** Per-frame chrome: skip-hold fill + cheat-sheet visibility. */
  update(skipFrac: number, helpHeld: boolean): void {
    const fill = this.els.btskipbar.querySelector('.fill i') as HTMLElement | null;
    if (fill) fill.style.width = `${Math.round(Math.min(1, skipFrac) * 100)}%`;
    this.els.btcheat.style.display = helpHeld ? 'block' : 'none';
  }

  showPause(on: boolean): void {
    this.els.btmenu.style.display = on ? 'block' : 'none';
  }

  get pauseVisible(): boolean {
    return this.els.btmenu.style.display === 'block';
  }

  showSummary(sum: BtSummary): void {
    document.exitPointerLock?.(); // the card needs a cursor
    this.els.btcard.style.display = 'none';
    this.els.btskipbar.style.display = 'none';
    this.els.btmenu.style.display = 'none';
    this.els.btsumtime.textContent = `${Math.floor(sum.seconds / 60)}m ${sum.seconds % 60}s`;
    this.els.btsumhints.textContent = String(sum.hints);
    this.els.btsumphases.textContent = sum.phasesDone.length ? sum.phasesDone.join(' ') : '—';
    const row = this.els.btsumphrow;
    row.textContent = '';
    for (const p of sum.phasesAvailable) {
      const b = document.createElement('button');
      b.textContent = p;
      b.title = btString(`tut.bt.phase.${p}`);
      b.onclick = () => this.hooks.onSummary('replay', p);
      row.appendChild(b);
    }
    this.els.btsummary.style.display = 'block';
  }

  destroy(): void {
    for (const t of this.introTimer) clearTimeout(t);
    this.root.remove();
  }
}
