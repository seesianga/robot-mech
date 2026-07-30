import { ProfileStore, type Profile, type SyncStatus } from '../save/profiles';
import { loadNavPrefs, saveNavPrefs, type NavPrefs } from '../save/navprefs';
import { MECHS } from '../sim/content';
import { MpClient } from '../net/mpclient';
import { netSession } from '../net/session';
import { controlsSummary } from '../engine/bindings';
import { PRESETS, setQuality, type QualityName } from '../engine/quality';
import { HangarService, type DeckFrame } from '../save/hangar';
import { HangarScreen } from './hangar';
import { PRODUCT_NAME, WORLD_NAME } from '../brand';

export interface StageInfo {
  stage: number;
  name: string;
  op?: number;
  opName?: string;
  branch?: 'a' | 'b';
}

const CSS = `
#startscreen .panel2 { border: 1px solid rgba(126,230,176,.4); background: rgba(8,16,13,.8); padding: 20px 28px; min-width: 380px; text-align: center; }
#startscreen .pilotline { color: #7ee6b0; font-size: 13px; letter-spacing: 2px; margin-bottom: 12px; }
#startscreen .pilotline b { color: #ffb347; }
#startscreen input { display: block; width: 100%; box-sizing: border-box; margin: 6px 0; padding: 8px 10px; background: #0a1310;
  border: 1px solid rgba(126,230,176,.45); color: #cfe; font-family: inherit; font-size: 13px; letter-spacing: 1px; }
#startscreen input:focus { outline: none; border-color: #ffb347; }
#startscreen .btnrow { display: flex; gap: 8px; justify-content: center; margin-top: 10px; flex-wrap: wrap; }
#startscreen button { background: none; border: 1px solid #7ee6b0; color: #7ee6b0; font-family: inherit;
  font-size: 12px; letter-spacing: 2px; padding: 7px 16px; cursor: pointer; }
#startscreen button:hover { background: rgba(126,230,176,.15); }
#startscreen button.primary { border-color: #ffb347; color: #ffb347; }
#startscreen button.primary:hover { background: rgba(255,179,71,.15); }
#startscreen button:disabled { opacity: .35; cursor: default; }
#startscreen .err { color: #ff5533; font-size: 11px; min-height: 15px; margin-top: 6px; }
#startscreen .stages { display: flex; gap: 6px; justify-content: flex-start; margin: 4px 0 10px; flex-wrap: wrap; }
#startscreen .stages button { font-size: 10px; letter-spacing: 1px; padding: 5px 9px; text-align: left; }
#startscreen .stages button.sel { background: rgba(255,179,71,.2); border-color: #ffb347; color: #ffb347; }
#startscreen .ops { max-height: 46vh; overflow-y: auto; text-align: left; margin: 12px 0 4px; padding-right: 6px; }
#startscreen .ophead { color: #ffb347; font-size: 10px; letter-spacing: 3px; margin: 8px 0 5px; border-bottom: 1px solid rgba(255,179,71,.25); padding-bottom: 3px; }
#startscreen .branchnote { color: rgba(200,230,215,.7); font-size: 10px; letter-spacing: 1px; margin: 2px 0 6px; }
#startscreen .small { font-size: 10px; color: rgba(126,230,176,.55); margin-top: 10px; letter-spacing: 1px; }
#startscreen .link { color: rgba(126,230,176,.7); font-size: 11px; text-decoration: underline; cursor: pointer; background: none; border: none; padding: 4px; }
#startscreen .scrip { color: #ffb347; font-size: 11px; letter-spacing: 1px; }
#startscreen .menu { display: flex; flex-direction: column; gap: 9px; margin: 16px 0 6px; }
#startscreen .menu button { padding: 11px 18px; font-size: 13px; letter-spacing: 3px; }
#startscreen .menu .rec { color: #ffb347; font-size: 10px; letter-spacing: 2px; }
#startscreen .phrow { display: flex; gap: 5px; justify-content: center; margin: -2px 0 4px; }
#startscreen .phrow button { padding: 4px 8px; font-size: 11px; letter-spacing: 1px; }
#startscreen .phrow button.donep { border-color: #ffb347; color: #ffb347; }
#startscreen .quality-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; margin: 6px 0; }
#startscreen .quality-grid button { min-height: 36px; padding: 6px 8px; white-space: normal; }
#startscreen .quality-grid button.sel { background: rgba(255,179,71,.2); border-color: #ffb347; color: #ffb347; }
#startscreen .quality-state { color: rgba(200,230,215,.75); font-size: 10px; line-height: 1.6; letter-spacing: 1px; margin: 7px 0; }
#startscreen .quality-state b { color: #3fd8f0; }
#startscreen .settings-panel { box-sizing: border-box; max-height: calc(100vh - 180px); overflow-y: auto; scrollbar-gutter: stable; }
#startscreen .stub { color: rgba(200,230,215,.75); font-size: 12px; line-height: 1.9; letter-spacing: 1px; margin: 18px 0 10px; }
#startscreen .sync { font-size: 10px; letter-spacing: 2px; margin-top: 8px; color: rgba(126,230,176,.55); }
#startscreen .sync.pending, #startscreen .sync.syncing { color: #3fd8f0; }
#startscreen .sync.offline { color: #ffb347; }
#startscreen .sync.error, #startscreen .sync.signed-out { color: #ff5533; }
#startscreen .migrate { border-top: 1px solid rgba(126,230,176,.2); margin-top: 12px; padding-top: 10px; }
#startscreen .migrate .rec { color: #ffb347; font-size: 10px; letter-spacing: 2px; display: block; margin-bottom: 6px; }
`;

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

const escapeAttr = escapeHtml;

/** Sync-state copy for the line under the pilot name. */
const SYNC_COPY: Record<SyncStatus['state'], string> = {
  clean: 'CLOUD SAVE · SYNCED',
  pending: 'CLOUD SAVE · CHANGES QUEUED',
  syncing: 'CLOUD SAVE · SYNCING…',
  offline: 'CLOUD SAVE · OFFLINE — SAVED ON THIS DEVICE',
  error: 'CLOUD SAVE · SYNC PROBLEM',
  'signed-out': 'CLOUD SAVE · SIGNED OUT',
};

/**
 * Pre-mission screen: pilot registration/login (local profiles), guest entry,
 * then the main menu — TUTORIAL / CAMPAIGN / MULTIPLAYER / SETTINGS. CAMPAIGN
 * opens the stage select gated by unlocked progress; the launch click doubles
 * as the audio/pointer-lock user gesture. MULTIPLAYER and SETTINGS are console
 * modules still being fitted (their build prompts come separately).
 */
export class StartScreen {
  private el: HTMLElement;
  private profile: Profile | null = null;
  private selectedStage = 1;
  private selectedBranch: 'a' | 'b' = 'a';
  private selInit = false;
  private view: 'main' | 'stages' | 'multiplayer' | 'mpqueue' | 'settings' = 'main';

  private mp: MpClient | null = null;
  private mpErr = '';
  private mpQueueMode: 'dm' | 'ctf' = 'dm';
  private mpQueueCount = 1;
  private mpQueueSecs = 30;
  private btOffered = false;
  private hangar: HangarService;
  private mpDeck: DeckFrame[] = [];
  private mpDeployIid = '';
  private sync: SyncStatus = { state: 'clean' };
  private migrateCallsign = '';
  private selectedQuality: QualityName;

  constructor(
    private store: ProfileStore,
    private stages: StageInfo[],
    private onIgnite: (stage: number, profile: Profile | null, branch?: 'a' | 'b') => void,
    private onGesture?: () => void,
    private playSfx?: (id: string, volume?: number) => void,
    private appliedQuality: QualityName = 'balanced',
  ) {
    this.selectedQuality = appliedQuality;
    this.hangar = new HangarService(store);
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.id = 'startscreen';
    document.body.appendChild(this.el);
    // the sync line is live: a background flush finishing repaints it in place
    // rather than waiting for the next navigation
    this.store.onSync((s) => {
      this.sync = s;
      const line = this.el.querySelector('#syncline');
      if (line) {
        line.className = `sync ${s.state}`;
        line.textContent = this.syncText();
      }
    });
    // the pilot played on another device and the registry copy just landed —
    // repaint so the menu shows the campaign they actually have
    this.store.onProgressChange(() => {
      if (this.profile && this.el.isConnected && this.view !== 'mpqueue') this.renderReady();
    });
  }

  /**
   * Resume the signed-in pilot from the registry. The account lives in the
   * service database, so this is a round trip — the screen says so rather than
   * flashing the sign-in form at a pilot who is already signed in.
   */
  show(): void {
    if (!this.store.signedIn()) {
      this.renderAuth('login');
      return;
    }
    this.renderBusy('RESUMING PILOT SESSION…');
    void this.store.restore().then((p) => {
      if (p) {
        this.profile = p;
        this.renderReady();
      } else {
        this.renderAuth('login');
      }
    }).catch(() => this.renderAuth('login'));
  }

  private renderBusy(label: string): void {
    this.el.innerHTML = `${this.header()}
      <div class="panel2">
        <div class="pilotline">${label}</div>
        <div class="stub">Contacting the pilot registry.</div>
      </div>`;
  }

  private syncText(): string {
    const base = SYNC_COPY[this.sync.state] ?? '';
    return this.sync.message ? `${base} — ${this.sync.message}` : base;
  }

  private syncLine(): string {
    if (!this.profile) return '';
    return `<div class="sync ${this.sync.state}" id="syncline">${this.syncText()}</div>`;
  }

  private header(): string {
    return `<h1>${PRODUCT_NAME.toUpperCase()}</h1>
      <h2>THE LIBERATION CAMPAIGN · 24 MISSIONS · 7 OPERATIONS</h2>`;
  }

  /**
   * Sign-in / registration against the pilot registry. The account and the save
   * live in the service database, not in this browser — the same callsign and
   * passcode reach the same campaign from any device.
   *
   * `migrate` is the one-way door for pilots created before the registry
   * existed: their browser-local save is verified against its old local hash,
   * claimed under the same callsign, and merged up. Nothing local is deleted.
   */
  private renderAuth(mode: 'login' | 'register' | 'migrate', prefillCallsign = ''): void {
    const other = mode === 'register' ? 'login' : 'register';
    const legacy = mode === 'login' ? this.store.pendingMigrations() : [];
    const title = mode === 'login' ? 'PILOT SIGN-IN'
      : mode === 'register' ? 'NEW PILOT REGISTRATION'
        : `MOVE PILOT TO THE REGISTRY — ${this.migrateCallsign.toUpperCase()}`;
    const action = mode === 'login' ? 'SIGN IN' : mode === 'register' ? 'REGISTER' : 'MOVE THIS PILOT UP';
    const blurb = mode === 'migrate'
      ? `This pilot was created before cloud saves and only exists in this browser.<br>
         Enter its passcode to claim the callsign in the registry and upload the campaign.<br>
         The local copy is left untouched.`
      : `Your pilot and campaign are stored in the registry — sign in from any device to continue.<br>
         Guest progress lasts only until the tab closes.`;

    const migrateBlock = legacy.length
      ? `<div class="migrate">
          <span class="rec">PILOTS SAVED IN THIS BROWSER ONLY</span>
          ${legacy.map((cs) => `<button class="link" data-mig="${escapeAttr(cs)}">move “${escapeHtml(cs)}” to the registry ▸</button>`).join('<br>')}
        </div>`
      : '';

    this.el.innerHTML = `${this.header()}
      <div class="panel2">
        <div class="pilotline">${title}</div>
        ${mode === 'migrate' ? '' : `<input id="cs" placeholder="CALLSIGN" maxlength="24" autocomplete="username" value="${escapeAttr(prefillCallsign)}" />`}
        <input id="pw" placeholder="PASSCODE" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" />
        <div class="err" id="err"></div>
        <div class="btnrow">
          <button class="primary" id="go">${action}</button>
          <button id="guest">ENTER AS GUEST</button>
        </div>
        ${mode === 'migrate'
        ? '<button class="link" id="swap">◂ back to sign-in</button>'
        : `<button class="link" id="swap">${other === 'login' ? 'have a pilot? sign in' : 'new pilot? register'}</button>`}
        <div class="small">${blurb}</div>
        ${migrateBlock}
      </div>`;

    const cs = this.el.querySelector('#cs') as HTMLInputElement | null;
    const pw = this.el.querySelector('#pw') as HTMLInputElement;
    const err = this.el.querySelector('#err') as HTMLElement;
    const go = this.el.querySelector('#go') as HTMLButtonElement;

    let busy = false;
    const submit = async (): Promise<void> => {
      if (busy) return;
      busy = true;
      const label = go.textContent;
      // the client stretches the passcode with 200k PBKDF2 rounds before it
      // leaves the device — that is a visible beat on a phone, so say so
      go.disabled = true;
      go.textContent = mode === 'login' ? 'SIGNING IN…' : 'WORKING…';
      err.textContent = '';
      try {
        const callsign = mode === 'migrate' ? this.migrateCallsign : (cs?.value ?? '');
        this.profile = mode === 'login' ? await this.store.login(callsign, pw.value)
          : mode === 'register' ? await this.store.register(callsign, pw.value)
            : await this.store.migrateLegacy(callsign, pw.value);
        this.renderReady();
      } catch (e) {
        err.textContent = e instanceof Error ? e.message : String(e);
        go.disabled = false;
        go.textContent = label;
        busy = false;
      }
    };
    go.onclick = () => void submit();
    pw.onkeydown = (e) => { if (e.key === 'Enter') void submit(); };
    if (cs) cs.onkeydown = (e) => { if (e.key === 'Enter') pw.focus(); };
    (this.el.querySelector('#guest') as HTMLButtonElement).onclick = () => {
      this.profile = null;
      this.renderReady();
    };
    (this.el.querySelector('#swap') as HTMLButtonElement).onclick = () =>
      this.renderAuth(mode === 'migrate' ? 'login' : other);
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-mig]')) {
      b.onclick = () => { this.migrateCallsign = b.dataset.mig ?? ''; this.renderAuth('migrate'); };
    }
    (cs ?? pw).focus();
  }

  private renderReady(): void {
    // always the stored copy: a background pull from the registry (the pilot
    // played on another device) may have replaced it since this render started
    const progress = this.store.progressOf(this.profile);
    if (!this.selInit) {
      const resume = this.store.takeResume();
      if (resume !== null && resume >= 1) this.view = 'stages'; // mid-campaign CONTINUE lands on stage select
      this.selectedStage = Math.min(Math.max(1, resume ?? progress.unlocked), progress.unlocked);
      this.selInit = true;
    } else {
      this.selectedStage = Math.min(this.selectedStage, progress.unlocked);
    }
    // saves from older builds can point past the last shipped stage — clamp
    this.selectedStage = Math.max(1, Math.min(this.selectedStage, this.stages[this.stages.length - 1].stage));

    const pilotline = `<div class="pilotline">PILOT: <b>${this.profile ? escapeHtml(this.profile.callsign.toUpperCase()) : 'GUEST (unsaved)'}</b>
          ${progress.scrip ? ` · <span class="scrip">${progress.scrip} scrip</span>` : ''}</div>`;

    // first-boot offer: once, after sign-in — accepting launches, skipping sets
    // the same basic_training_complete flag a completion would. Never nags again.
    if (this.view === 'main' && !progress.tutorialDone && !this.btOffered) {
      this.btOffered = true;
      this.el.innerHTML = `${this.header()}
        <div class="panel2">
          ${pilotline}
          <div class="pilotline">TAKE BASIC TRAINING?</div>
          <div class="stub">A quiet controls tutorial on the calibration pad.<br>Recommended · about 7 minutes · skippable at any point.</div>
          <div class="btnrow">
            <button class="primary" id="bt-accept">ACCEPT</button>
            <button id="bt-skip">SKIP</button>
          </div>
        </div>`;
      (this.el.querySelector('#bt-accept') as HTMLButtonElement).onclick = () => {
        this.el.remove();
        this.onIgnite(0, this.profile); // the click is the audio gesture
      };
      (this.el.querySelector('#bt-skip') as HTMLButtonElement).onclick = () => {
        this.store.markTutorialDone(this.profile);
        if (this.profile) this.profile = this.store.get(this.profile.callsign);
        this.renderReady();
      };
      return;
    }

    if (this.view === 'main') {
      const [c1, c2] = controlsSummary();
      const phasesDone = progress.btPhases ?? [];
      // G (squad) is feature-gated off in this build — offering it would just
      // land the pilot in the checkride; re-add when the wingmate AI ships
      const phrow = progress.tutorialDone
        ? `<div class="phrow">${['A', 'B', 'C', 'D', 'E', 'F', 'H'].map((p) =>
          `<button data-ph="${p}" class="${phasesDone.includes(p) ? 'donep' : ''}">${p}</button>`).join('')}</div>`
        : '';
      // hangar nudge: something new is within reach ("Bay 3 is 2,400 short" moments)
      const acct = this.hangar.account(this.profile);
      const nextBay = this.hangar.nextLockedBay(this.profile);
      const bayNudge = nextBay >= 0 && acct.scrip >= this.hangar.bayPrice(nextBay)
        ? ` <span class="rec">· BAY ${nextBay + 1} AFFORDABLE</span>` : '';
      this.el.innerHTML = `${this.header()}
        <div class="panel2">
          ${pilotline}
          <div class="menu">
            <button class="primary" id="mm-tut">TRAINING — BASIC TRAINING (~7 MIN) ${progress.tutorialDone ? '' : '<span class="rec">· RECOMMENDED</span>'}</button>
            ${phrow}
            <button id="mm-camp">CAMPAIGN — LIBERATE ${WORLD_NAME.toUpperCase()} (24 MISSIONS)</button>
            <button id="mm-hangar">HANGAR — FRAMES &amp; DEPLOYMENT BAYS${bayNudge}</button>
            <button id="mm-mp">MULTIPLAYER</button>
            <button id="mm-set">SETTINGS</button>
          </div>
          <button class="link" id="logout">${this.profile ? 'switch pilot' : 'sign in / register'}</button>
          ${this.syncLine()}
          <div class="small">${c1}<br>${c2}</div>
        </div>`;
      (this.el.querySelector('#mm-tut') as HTMLButtonElement).onclick = () => {
        this.el.remove();
        this.onIgnite(0, this.profile); // stage 0 = Basic Training; the click is the audio gesture
      };
      (this.el.querySelector('#mm-hangar') as HTMLButtonElement).onclick = () => this.openHangar();
      for (const b of this.el.querySelectorAll<HTMLButtonElement>('.phrow button')) {
        b.onclick = () => {
          this.store.setBtPhase(b.dataset.ph ?? 'A');
          this.el.remove();
          this.onIgnite(0, this.profile);
        };
      }
      (this.el.querySelector('#mm-camp') as HTMLButtonElement).onclick = () => { this.view = 'stages'; this.renderReady(); };
      (this.el.querySelector('#mm-mp') as HTMLButtonElement).onclick = () => { this.view = 'multiplayer'; this.renderReady(); };
      (this.el.querySelector('#mm-set') as HTMLButtonElement).onclick = () => { this.view = 'settings'; this.renderReady(); };
      (this.el.querySelector('#logout') as HTMLButtonElement).onclick = () => {
        const wasCallsign = this.profile?.callsign ?? '';
        this.store.takeBtPhase(); // a phase hint never crosses identities
        this.btOffered = false; // a fresh identity gets its own first-boot offer
        this.profile = null;
        this.view = 'main';
        this.renderBusy('SIGNING OUT…');
        // push anything queued BEFORE dropping the session — switching pilots
        // must never be the thing that loses a mission
        void this.store.signOut().finally(() => this.renderAuth('login', wasCallsign));
      };
      return;
    }

    if (this.view === 'settings') {
      // PATHLIGHT navigation guidance settings. Content may disable layers per
      // route; the pilot may disable layers here; nothing may disable all of
      // them — the compass tick survives the minimal preset.
      const p = loadNavPrefs();
      const qualityPending = this.selectedQuality !== this.appliedQuality;
      const qualityButtons = (Object.keys(PRESETS) as QualityName[]).map((name) => {
        const selected = name === this.selectedQuality;
        return `<button data-quality="${name}" class="${selected ? 'sel' : ''}" aria-pressed="${selected}">
          ${PRESETS[name].label.toUpperCase()}</button>`;
      }).join('');
      const row = (id: string, label: string, value: string): string =>
        `<button data-set="${id}" style="display:flex;justify-content:space-between;width:100%;box-sizing:border-box;text-align:left;">
          <span>${label}</span><span style="color:#3fd8f0">${value}</span></button>`;
      this.el.innerHTML = `${this.header()}
        <div class="panel2 settings-panel">
          ${pilotline}
          <div class="pilotline">SETTINGS — GUIDANCE (PATHLIGHT)</div>
          <div class="menu" style="gap:5px">
            ${row('chevrons', 'PATH CHEVRONS', p.chevrons ? 'ON' : 'OFF')}
            ${row('beacon', 'DESTINATION BEACON', p.beacon ? 'ON' : 'OFF')}
            ${row('arrow', 'GUIDANCE ARROW', p.arrow.toUpperCase())}
            ${row('compass', 'COMPASS STRIP', p.compass ? 'ON' : 'OFF')}
            ${row('audioBeacon', 'AUDIO BEACON', p.audioBeacon.toUpperCase())}
            ${row('reducedMotion', 'REDUCED MOTION', p.reducedMotion.toUpperCase())}
            ${row('reducedFlash', 'REDUCED FLASH', p.reducedFlash ? 'ON' : 'OFF')}
            ${row('highContrast', 'HIGH CONTRAST NAV', p.highContrast ? 'ON' : 'OFF')}
            ${row('assistReposition', 'REPOSITION ASSIST', p.assistReposition ? 'ALLOWED' : 'NEVER')}
            ${row('scale', 'NAV HUD SCALE', `${Math.round(p.scale * 100)}%`)}
          </div>
          <div class="pilotline" style="margin-top:18px">SETTINGS — GRAPHICS QUALITY</div>
          <div class="quality-grid">${qualityButtons}</div>
          <div class="quality-state">
            RUNNING: <b>${PRESETS[this.appliedQuality].label.toUpperCase()}</b><br>
            ${qualityPending
              ? `SAVED: <b>${PRESETS[this.selectedQuality].label.toUpperCase()}</b> · RELOAD REQUIRED TO APPLY`
              : 'THIS PRESET IS ACTIVE'}
          </div>
          ${qualityPending ? '<button class="primary" id="quality-reload">APPLY &amp; RELOAD</button>' : ''}
          <div class="stub">Audio and controls tuning open after the next refit.<br>Guidance settings apply from the next sortie.</div>
          <button class="link" id="back">◂ back</button>
        </div>`;
      const cycle = (prefs: NavPrefs, id: string): void => {
        switch (id) {
          case 'chevrons': prefs.chevrons = !prefs.chevrons; break;
          case 'beacon': prefs.beacon = !prefs.beacon; break;
          case 'arrow': prefs.arrow = prefs.arrow === 'always' ? 'offscreen' : prefs.arrow === 'offscreen' ? 'off' : 'always'; break;
          case 'compass': prefs.compass = !prefs.compass; break;
          case 'audioBeacon': prefs.audioBeacon = prefs.audioBeacon === 'off' ? 'subtle' : prefs.audioBeacon === 'subtle' ? 'full' : 'off'; break;
          case 'reducedMotion': prefs.reducedMotion = prefs.reducedMotion === 'auto' ? 'on' : 'auto'; break;
          case 'reducedFlash': prefs.reducedFlash = !prefs.reducedFlash; break;
          case 'highContrast': prefs.highContrast = !prefs.highContrast; break;
          case 'assistReposition': prefs.assistReposition = !prefs.assistReposition; break;
          case 'scale': prefs.scale = prefs.scale >= 1.4 ? 0.8 : Math.round((prefs.scale + 0.2) * 10) / 10; break;
        }
      };
      for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-set]')) {
        b.onclick = () => {
          const prefs = loadNavPrefs();
          cycle(prefs, b.dataset.set!);
          saveNavPrefs(prefs);
          this.playSfx?.('ui.bt.confirm', 0.5);
          this.renderReady();
        };
      }
      for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-quality]')) {
        b.onclick = () => {
          const name = b.dataset.quality as QualityName;
          setQuality(name);
          this.selectedQuality = name;
          this.playSfx?.('ui.bt.confirm', 0.5);
          this.renderReady();
        };
      }
      const reload = this.el.querySelector<HTMLButtonElement>('#quality-reload');
      if (reload) {
        reload.onclick = () => {
          // ?quality= is a QA override with priority over the saved preference.
          // Remove only that parameter so the selected preset wins after boot.
          const next = new URL(location.href);
          next.searchParams.delete('quality');
          location.replace(next.href);
        };
      }
      (this.el.querySelector('#back') as HTMLButtonElement).onclick = () => { this.view = 'main'; this.renderReady(); };
      return;
    }

    if (this.view === 'multiplayer') {
      // Core Rule: the six Deployment Bays ARE the multiplayer deck. No
      // occupied bay → the queue is closed and the pilot is routed to the Hangar.
      const deck = this.hangar.deck(this.profile);
      const deckRail = deck.length
        ? `<div class="small" style="margin-bottom:6px">YOUR DECK — ${deck.map((f, i) =>
          `${i + 1}. ${(MECHS[f.chassis]?.name ?? f.chassis).toUpperCase()}`).join(' · ')}</div>`
        : '';
      const joinButtons = deck.length
        ? `<button class="primary" id="mp-dm">JOIN MATCH — DEATHMATCH<br><span class="rec">first team to 20 kills · 1 point per kill</span></button>
           <button class="primary" id="mp-ctf">JOIN MATCH — CAPTURE THE FLAG<br><span class="rec">turn the flag your color — then points accumulate</span></button>`
        : `<div class="stub">No deployable frames — your Deployment Bays are empty.<br>Assign at least one owned frame to a bay to queue.</div>
           <button class="primary" id="mp-hangar">OUTFIT YOUR HANGAR ▸</button>`;
      this.el.innerHTML = `${this.header()}
        <div class="panel2">
          ${pilotline}
          <div class="pilotline">MULTIPLAYER — 5 vs 5</div>
          ${deckRail}
          <div class="menu">
            ${joinButtons}
            <button id="mp-bots">PRACTICE SKIRMISH — VS BOTS</button>
            ${deck.length ? '<button id="mp-hangar">EDIT HANGAR</button>' : ''}
          </div>
          <div class="err">${this.mpErr}</div>
          <div class="small">Joining pools you with every pilot who joins in the same 30 seconds.<br>Seats still empty at the drop are filled by robots.<br>Your deck is frozen at the drop — a destroyed frame is spent for that match.</div>
          <button class="link" id="back">◂ back</button>
        </div>`;
      const dm = this.el.querySelector('#mp-dm') as HTMLButtonElement | null;
      if (dm) dm.onclick = () => { this.onGesture?.(); void this.mpQueue('dm'); };
      const ctf = this.el.querySelector('#mp-ctf') as HTMLButtonElement | null;
      if (ctf) ctf.onclick = () => { this.onGesture?.(); void this.mpQueue('ctf'); };
      const hg = this.el.querySelector('#mp-hangar') as HTMLButtonElement | null;
      if (hg) hg.onclick = () => this.openHangar('multiplayer');
      (this.el.querySelector('#mp-bots') as HTMLButtonElement).onclick = () => {
        this.onGesture?.();
        this.el.remove();
        this.onIgnite(90, this.profile);
      };
      (this.el.querySelector('#back') as HTMLButtonElement).onclick = () => { this.mpLeave(); this.view = 'main'; this.renderReady(); };
      return;
    }

    if (this.view === 'mpqueue') {
      // first-drop pick: any deck frame; destruction spends it for the match
      const deckChips = this.mpDeck.map((f, i) => {
        const def = MECHS[f.chassis];
        const sel = f.iid === this.mpDeployIid;
        return `<button data-deploy="${f.iid}" class="${sel ? 'sel' : ''}" aria-pressed="${sel}"
          style="${sel ? 'background:rgba(255,179,71,.2);border-color:#ffb347;color:#ffb347;' : ''}">
          ${i + 1}. ${(def?.name ?? f.chassis).toUpperCase()} — ${def?.tons ?? '?'}T</button>`;
      }).join('');
      const modeName = this.mpQueueMode === 'ctf' ? 'CAPTURE THE FLAG' : 'DEATHMATCH';
      this.el.innerHTML = `${this.header()}
        <div class="panel2">
          ${pilotline}
          <div class="pilotline">MATCHMAKING — ${modeName} · 5 vs 5</div>
          <div class="stub">${this.mpQueueCount} PILOT${this.mpQueueCount === 1 ? '' : 'S'} IN THE POOL<br>
            DROP IN <b>${this.mpQueueSecs}</b> SECONDS</div>
          <div class="small">FIRST DROP — PICK A DECK FRAME (${this.mpDeck.length} BAY${this.mpDeck.length === 1 ? '' : 'S'})</div>
          <div class="stages" style="justify-content:center">${deckChips}</div>
          <div class="err">${this.mpErr}</div>
          <div class="small">Everyone who joins before the counter hits zero drops together.<br>Empty seats are filled by robots.</div>
          <button class="link" id="mp-cancel">◂ cancel</button>
        </div>`;
      for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-deploy]')) {
        b.onclick = () => {
          this.mpDeployIid = b.dataset.deploy!;
          this.mp?.send({ t: 'deploy', iid: this.mpDeployIid });
          this.renderReady();
        };
      }
      (this.el.querySelector('#mp-cancel') as HTMLButtonElement).onclick = () => {
        this.mp?.send({ t: 'unqueue' });
        this.view = 'multiplayer';
        this.renderReady();
      };
      return;
    }

    // group the ladder by operation; stage 21 renders as the 21A/21B fork
    const byOp = new Map<number, StageInfo[]>();
    for (const s of this.stages) {
      const op = s.op ?? 1;
      if (!byOp.has(op)) byOp.set(op, []);
      byOp.get(op)!.push(s);
    }
    const opBlocks = [...byOp.entries()].map(([op, list]) => {
      const btns = list.map((s) => {
        const locked = s.stage > progress.unlocked;
        const sel = s.stage === this.selectedStage && (s.stage !== 21 || (s.branch ?? 'a') === this.selectedBranch);
        const num = s.branch ? `21${s.branch.toUpperCase()}` : `${s.stage}`;
        return `<button data-stage="${s.stage}" data-branch="${s.branch ?? ''}" ${locked ? 'disabled' : ''} class="${sel ? 'sel' : ''}">
          ${locked ? '🔒 ' : ''}${num}. ${s.name}</button>`;
      }).join('');
      return `<div class="opgroup"><div class="ophead">OPERATION ${op} — ${(list[0].opName ?? '').toUpperCase()}</div>
        <div class="stages">${btns}</div></div>`;
    }).join('');

    const branchNote = this.selectedStage === 21
      ? `<div class="branchnote">M21 is the fork: EXTRACTION saves Commander Ekene · OVERRIDE takes the orbital guns. The choice shapes the ending.</div>`
      : '';

    this.el.innerHTML = `${this.header()}
      <div class="panel2">
        ${pilotline}
        <div class="ops">${opBlocks}</div>
        ${branchNote}
        <div class="btnrow"><button class="primary" id="ignite">CLICK TO IGNITE REACTOR ▶</button></div>
        <button class="link" id="back">◂ back</button>
        <div class="small">${controlsSummary()[0]}<br>${controlsSummary()[1]}</div>
      </div>`;

    for (const b of this.el.querySelectorAll<HTMLButtonElement>('.stages button')) {
      b.onclick = () => {
        this.selectedStage = parseInt(b.dataset.stage ?? '1', 10);
        if (b.dataset.branch) this.selectedBranch = b.dataset.branch as 'a' | 'b';
        this.renderReady();
      };
    }
    (this.el.querySelector('#ignite') as HTMLButtonElement).onclick = () => {
      this.onGesture?.();
      this.store.takeBtPhase(); // discard any stale Basic Training phase hint
      this.el.remove();
      this.onIgnite(this.selectedStage, this.profile, this.selectedStage === 21 ? this.selectedBranch : undefined);
    };
    (this.el.querySelector('#back') as HTMLButtonElement).onclick = () => { this.view = 'main'; this.renderReady(); };
  }

  /** Open Chief Okafor's service bay; returns to `backTo` (same lobby seat). */
  private openHangar(backTo: 'main' | 'multiplayer' = 'main'): void {
    this.onGesture?.(); // the click primes the audio context for UI sfx
    const screen = new HangarScreen(
      document.body,
      this.hangar,
      this.store,
      () => this.profile,
      () => {
        // profile scrip/hangar may have changed — re-render the menu fresh
        if (this.profile) this.profile = this.store.get(this.profile.callsign);
        this.view = backTo;
        this.renderReady();
      },
      this.playSfx,
    );
    screen.show();
  }

  // --- 5v5 quick-match plumbing ---

  /**
   * Where the match server lives.
   *
   *  - Local/LAN dev  → the Node relay on :4177
   *  - Same-origin    → /ws, when the page is served by the Worker that also hosts
   *                     the MatchLobby Durable Object
   *  - Otherwise      → VITE_MP_URL
   *
   * The site is served from Cloudflare Pages (robot-mech.pages.dev), and Pages
   * cannot host a Durable Object — a DO class has to be defined in a Worker. So the
   * static game moved to Pages while the match server stayed on the Worker, and the
   * client reaches it cross-origin. Build with VITE_MP_URL set to that Worker's
   * wss:// endpoint; without it we fall back to same-origin /ws, which is still
   * correct for anyone loading the game straight off the Worker.
   */
  private static mpUrl(): string {
    const h = location.hostname;
    const local = h === 'localhost' || h.startsWith('127.') || h.startsWith('192.168.') || h.startsWith('10.') || h.endsWith('.local');
    if (local) return `ws://${h}:4177`;
    const configured = import.meta.env.VITE_MP_URL as string | undefined;
    if (configured) return configured;
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }

  private async mpQueue(mode: 'dm' | 'ctf'): Promise<void> {
    this.mpErr = '';
    // deck snapshot at ready-up: the bays as they stand RIGHT NOW define the match
    this.mpDeck = this.hangar.deck(this.profile);
    if (!this.mpDeck.length) {
      this.mpErr = 'No deployable frames — outfit your Hangar first.';
      this.renderReady();
      return;
    }
    if (!this.mpDeck.some((f) => f.iid === this.mpDeployIid)) this.mpDeployIid = this.mpDeck[0].iid;
    try {
      if (!this.mp) {
        const c = new MpClient();
        await c.connect(StartScreen.mpUrl());
        this.mp = c;
        c.on('qstatus', (msg) => {
          this.mpQueueCount = (msg.count as number) ?? 1;
          this.mpQueueSecs = (msg.secs as number) ?? 30;
          if (this.view === 'mpqueue') this.renderReady();
        });
        c.on('error', (msg) => {
          this.mpErr = String(msg.msg ?? 'Server error');
          this.renderReady();
        });
        c.on('start', (msg) => {
          const roster = msg.roster as never[];
          const me = (roster as Array<{ id: number; team: string }>).find((r) => r.id === c.myId);
          netSession.active = {
            client: c,
            myId: c.myId,
            mode: (msg.mode as 'dm' | 'ctf') ?? 'dm',
            roster,
            myTeam: me?.team ?? 'a',
            hostId: (msg.host as number) ?? c.myId,
            lastAttacker: 0,
            ownedBots: [],
            deck: this.mpDeck,
            spent: new Set(),
            currentIid: this.mpDeployIid,
            deckExhausted: msg.deckExhausted === 'spectate' ? 'spectate' : 'recycle',
          };
          // world building (physics WASM) takes a beat — queue anything the
          // server says before main.ts registers its match handlers
          c.buffering = true;
          this.mp = null; // ownership moves to the match
          this.el.remove();
          this.onIgnite(99, this.profile);
        });
        const name = this.profile?.callsign ?? `GUEST-${Math.floor(Math.random() * 900 + 100)}`;
        c.send({ t: 'hello', name });
      }
      // (re)declare the deck + first-drop pick, then queue — server validates all three
      this.mp.send({ t: 'deck', frames: this.mpDeck });
      this.mp.send({ t: 'deploy', iid: this.mpDeployIid });
      this.mp.send({ t: 'queue', mode });
      this.mpQueueMode = mode;
      this.mpQueueCount = 1;
      this.mpQueueSecs = 30;
      this.view = 'mpqueue';
      this.renderReady();
    } catch (e) {
      this.mpErr = e instanceof Error ? e.message : String(e);
      this.mp = null;
      this.renderReady();
    }
  }

  private mpLeave(): void {
    this.mp?.send({ t: 'unqueue' });
    this.mp?.close();
    this.mp = null;
    this.mpErr = '';
  }
}
