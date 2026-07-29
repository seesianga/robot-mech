import * as THREE from 'three';
import { Mech } from '../sim/mech';
import { mechDef, MECHS, WEAPONS } from '../sim/content';
import { buildMechVisual, COMPACT_PALETTE } from '../world/mechfactory';
import { loadModel, instantiate, fitToHeight, orientToGameForward } from '../world/assets';
import type { Profile, ProfileStore } from '../save/profiles';
import { HangarService, errorCopy, BAY_COUNT, type FrameInstance, type Account } from '../save/hangar';
import { bayOf, checkInvariants } from '../../server/hangarcore.mjs';

/**
 * THE HANGAR — Chief Nadi Okafor's service bay. Three panes plus a tab:
 * the Deployment Rail (six bay chips, bottom), the Collection Grid (left),
 * the Inspector with a live turntable (right), and the Requisition catalog.
 * The screen only ever renders server-confirmed state re-read from the store;
 * nothing here decides an outcome — HangarService/hangarcore does.
 *
 * Fully keyboard operable: every interaction is a real <button>, Escape backs
 * out of modals/pickers/screen, bay states are icon+text (never color alone).
 */

const CSS = `
#hangarscreen { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column;
  background: linear-gradient(180deg, #060c09 0%, #0a1310 55%, #101a14 100%); color: #cfe;
  font-family: inherit; letter-spacing: 1px; }
#hangarscreen .hg-top { display: flex; align-items: center; gap: 14px; padding: 12px 18px 8px; }
#hangarscreen .hg-title { color: #ffb347; font-size: 16px; letter-spacing: 4px; }
#hangarscreen .hg-sub { color: rgba(126,230,176,.6); font-size: 10px; letter-spacing: 2px; }
#hangarscreen .hg-tabs { display: flex; gap: 6px; margin-left: 18px; }
#hangarscreen .hg-wallet { margin-left: auto; color: #ffb347; font-size: 13px; letter-spacing: 2px;
  border: 1px solid rgba(255,179,71,.4); padding: 5px 12px; }
#hangarscreen button { background: none; border: 1px solid #7ee6b0; color: #7ee6b0; font-family: inherit;
  font-size: 11px; letter-spacing: 2px; padding: 6px 12px; cursor: pointer; }
#hangarscreen button:hover, #hangarscreen button:focus-visible { background: rgba(126,230,176,.15); outline: none; }
#hangarscreen button.primary { border-color: #ffb347; color: #ffb347; }
#hangarscreen button.primary:hover, #hangarscreen button.primary:focus-visible { background: rgba(255,179,71,.15); }
#hangarscreen button.tab.on { background: rgba(255,179,71,.2); border-color: #ffb347; color: #ffb347; }
#hangarscreen button:disabled { opacity: .35; cursor: default; }
#hangarscreen .hg-main { flex: 1; display: flex; gap: 12px; padding: 4px 18px; min-height: 0; }
#hangarscreen .hg-left { flex: 1.15; min-width: 0; display: flex; flex-direction: column; border: 1px solid rgba(126,230,176,.3);
  background: rgba(8,16,13,.7); }
#hangarscreen .hg-right { flex: 1; min-width: 0; display: flex; flex-direction: column; border: 1px solid rgba(126,230,176,.3);
  background: rgba(8,16,13,.7); }
#hangarscreen .hg-panehead { color: #ffb347; font-size: 10px; letter-spacing: 3px; padding: 8px 12px;
  border-bottom: 1px solid rgba(255,179,71,.25); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
#hangarscreen .hg-scroll { flex: 1; overflow-y: auto; padding: 10px 12px; min-height: 0; }
#hangarscreen .hg-filters { display: flex; gap: 4px; flex-wrap: wrap; margin-left: auto; }
#hangarscreen .hg-filters button { font-size: 9px; padding: 3px 7px; }
#hangarscreen .hg-filters button.on { border-color: #ffb347; color: #ffb347; }
#hangarscreen input.hg-search { background: #0a1310; border: 1px solid rgba(126,230,176,.45); color: #cfe;
  font-family: inherit; font-size: 10px; letter-spacing: 1px; padding: 4px 8px; width: 110px; }
#hangarscreen .chassis-card { border: 1px solid rgba(126,230,176,.3); margin-bottom: 8px; }
#hangarscreen .chassis-head { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
  border: none; padding: 8px 10px; }
#hangarscreen .chassis-head .sil { width: 34px; height: 34px; border: 1px solid rgba(126,230,176,.4);
  display: flex; align-items: center; justify-content: center; color: #7ee6b0; font-size: 15px; flex: none; }
#hangarscreen .chassis-head .nm { color: #cfe; font-size: 12px; letter-spacing: 2px; }
#hangarscreen .chassis-head .cls { color: rgba(126,230,176,.65); font-size: 9px; letter-spacing: 2px; }
#hangarscreen .chassis-head .owned { margin-left: auto; color: #ffb347; font-size: 11px; letter-spacing: 1px; flex: none; }
#hangarscreen .inst-row { display: flex; align-items: center; gap: 8px; padding: 5px 10px 5px 34px;
  border-top: 1px dashed rgba(126,230,176,.2); }
#hangarscreen .inst-row .lbl { font-size: 11px; color: #cfe; }
#hangarscreen .inst-row .tag { font-size: 9px; color: #ffb347; border: 1px solid rgba(255,179,71,.5); padding: 1px 5px; }
#hangarscreen .inst-row .via { font-size: 9px; color: rgba(126,230,176,.55); }
#hangarscreen .inst-row button { font-size: 9px; padding: 3px 8px; margin-left: auto; }
#hangarscreen .inst-row.sel { background: rgba(255,179,71,.12); }
#hangarscreen .hg-rail { display: flex; gap: 8px; padding: 10px 18px 14px; align-items: stretch; }
#hangarscreen .bay { flex: 1; border: 1px solid rgba(126,230,176,.4); background: rgba(8,16,13,.8);
  padding: 8px 10px; text-align: left; min-width: 0; position: relative; }
#hangarscreen .bay .bn { color: rgba(126,230,176,.7); font-size: 9px; letter-spacing: 2px; }
#hangarscreen .bay .bt { color: #cfe; font-size: 12px; letter-spacing: 1px; margin: 3px 0 1px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
#hangarscreen .bay .bs { color: rgba(126,230,176,.6); font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#hangarscreen .bay.occupied { border-color: #7ee6b0; }
#hangarscreen .bay.sel { border-color: #ffb347; background: rgba(255,179,71,.1); }
#hangarscreen .bay.empty { border-style: dashed; }
#hangarscreen .bay.locked { opacity: .8; }
#hangarscreen .bay.locked.later { opacity: .45; }
#hangarscreen .bay .clear { position: absolute; top: 4px; right: 4px; font-size: 9px; padding: 1px 6px;
  border-color: rgba(255,85,51,.6); color: #ff8873; }
#hangarscreen .hg-stats { font-size: 11px; line-height: 1.9; color: rgba(220,240,232,.9); }
#hangarscreen .hg-stats b { color: #7ee6b0; font-weight: normal; }
#hangarscreen .hg-actions { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 12px; border-top: 1px solid rgba(126,230,176,.2); }
#hangarscreen .turn { height: 220px; border-bottom: 1px solid rgba(126,230,176,.2); position: relative; flex: none; }
#hangarscreen .turn canvas { width: 100%; height: 100%; display: block; }
#hangarscreen .turn .fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: rgba(126,230,176,.4); font-size: 40px; letter-spacing: 8px; }
#hangarscreen .req-row { display: flex; align-items: center; gap: 10px; border: 1px solid rgba(126,230,176,.3);
  padding: 8px 10px; margin-bottom: 8px; }
#hangarscreen .req-row.sel { border-color: #ffb347; background: rgba(255,179,71,.08); }
#hangarscreen .req-row .req-view { all: unset; cursor: pointer; display: flex; align-items: center; gap: 10px;
  flex: 1; min-width: 0; }
#hangarscreen .req-row .req-view:hover .nm, #hangarscreen .req-row .req-view:focus-visible .nm { color: #ffb347; }
#hangarscreen .req-row .req-view:focus-visible { outline: 1px solid #ffb347; outline-offset: 3px; }
#hangarscreen .req-row .nm { font-size: 12px; color: #cfe; letter-spacing: 2px; }
#hangarscreen .req-row .meta { font-size: 9px; color: rgba(126,230,176,.65); }
#hangarscreen .req-row .price { margin-left: auto; color: #ffb347; font-size: 12px; letter-spacing: 1px; flex: none; }
#hangarscreen .hg-note { color: rgba(200,230,215,.75); font-size: 10px; letter-spacing: 1px; padding: 6px 12px; }
#hangarscreen .hg-err { color: #ff5533; font-size: 10px; letter-spacing: 1px; padding: 2px 12px; min-height: 14px; }
#hangarscreen .modal-back { position: fixed; inset: 0; background: rgba(3,8,6,.85); z-index: 60;
  display: flex; align-items: center; justify-content: center; }
#hangarscreen .modal { border: 1px solid rgba(255,179,71,.5); background: rgba(8,16,13,.97); padding: 20px 26px;
  max-width: 460px; text-align: center; }
#hangarscreen .modal .mh { color: #ffb347; font-size: 12px; letter-spacing: 3px; margin-bottom: 10px; }
#hangarscreen .modal .mb { font-size: 11px; line-height: 1.8; color: rgba(220,240,232,.92); margin-bottom: 14px; }
#hangarscreen .modal .btnrow { display: flex; gap: 8px; justify-content: center; }
#hangarscreen .modal input { background: #0a1310; border: 1px solid rgba(126,230,176,.45); color: #cfe;
  font-family: inherit; font-size: 12px; letter-spacing: 1px; padding: 6px 10px; width: 100%; box-sizing: border-box; }
#hangarscreen .coach { position: absolute; z-index: 55; border: 1px solid #ffb347; background: rgba(20,16,6,.96);
  color: #ffd9a0; font-size: 10px; letter-spacing: 1px; padding: 8px 12px; max-width: 240px; line-height: 1.7; }
#hangarscreen .picker-hint { border: 1px dashed rgba(255,179,71,.5); color: #ffd9a0; font-size: 10px;
  padding: 8px 10px; margin-bottom: 8px; line-height: 1.7; }
`;

type Tab = 'bays' | 'requisition';
type Modal =
  | { kind: 'unlockBay'; bay: number; key: string }
  | { kind: 'purchase'; chassis: string; key: string }
  | { kind: 'scrap'; iid: string; key: string; confirmed: boolean }
  | { kind: 'rename'; iid: string; draft?: string }
  | null;

const CLASS_LABEL: Record<string, string> = { light: 'SCOUT', medium: 'LINE', heavy: 'HEAVY', assault: 'SIEGE' };
const COACH_KEY = 'veyra.hangar.coach.v1';

/** Escape free-form text (search box, frame names) before innerHTML interpolation. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
}

function loadoutSummary(chassis: string): string {
  const def = MECHS[chassis];
  if (!def) return '';
  const counts = new Map<string, number>();
  for (const w of def.defaultLoadout) {
    const name = WEAPONS[w]?.name ?? w;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([n, c]) => (c > 1 ? `${c}× ${n}` : n)).join(' · ');
}

/** Small self-contained turntable: one WebGL context, mech swapped in place. */
class Turntable {
  readonly el: HTMLDivElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1.6, 0.1, 300);
  private current: THREE.Object3D | null = null;
  private raf = 0;
  private chassis = '';

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'turn';
    this.el.setAttribute('aria-hidden', 'true');
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.scene.add(new THREE.HemisphereLight(0xc4d8e2, 0x2a2a20, 1.5));
      const key = new THREE.DirectionalLight(0xffe8c8, 2.0);
      key.position.set(30, 45, 35);
      this.scene.add(key);
      const grid = new THREE.GridHelper(40, 16, 0x2e4a3e, 0x1d2c26);
      this.scene.add(grid);
      this.el.appendChild(this.renderer.domElement);
      const loop = (): void => {
        this.raf = requestAnimationFrame(loop);
        if (!this.renderer || !this.el.isConnected) return;
        const w = this.el.clientWidth || 300, h = this.el.clientHeight || 220;
        if (this.renderer.domElement.width !== Math.floor(w * this.renderer.getPixelRatio())) {
          this.renderer.setSize(w, h, false);
          this.camera.aspect = w / h;
          this.camera.updateProjectionMatrix();
        }
        if (this.current) this.current.rotation.y += 0.006;
        this.renderer.render(this.scene, this.camera);
      };
      loop();
    } catch {
      this.renderer = null;
    }
  }

  show(chassis: string): void {
    if (!this.renderer) {
      this.el.innerHTML = `<div class="fallback">${(MECHS[chassis]?.name ?? '?').slice(0, 3).toUpperCase()}</div>`;
      return;
    }
    if (chassis === this.chassis) return;
    this.chassis = chassis;
    if (this.current) this.scene.remove(this.current);
    this.current = null;
    try {
      const mech = new Mech(mechDef(chassis), 'compact', 'DISPLAY');
      const visual = buildMechVisual(mech, COMPACT_PALETTE, false);
      const box = new THREE.Box3().setFromObject(visual.root);
      const size = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      visual.root.position.sub(c).add(new THREE.Vector3(0, size.y / 2, 0));
      const group = new THREE.Group();
      group.add(visual.root);
      this.scene.add(group);
      this.current = group;
      const d = Math.max(size.x, size.y, size.z) * 1.15;
      this.camera.position.set(d * 0.8, size.y * 0.62, d);
      this.camera.lookAt(0, size.y * 0.45, 0);

      // Upgrade to the real Tripo model once it arrives. The turntable is a pure
      // display context — no rig, no hit zones — so the full LOD0 mesh drops
      // straight in. The procedural build above stays on screen until then, and
      // stays permanently if the asset was never generated.
      void this.upgrade(chassis, group, size.y);
    } catch {
      /* turntable is garnish — stats and actions carry the screen */
    }
  }

  /** Swap the procedural placeholder for the generated mesh, if one exists. */
  private async upgrade(chassis: string, group: THREE.Group, height: number): Promise<void> {
    const src = await loadModel(`mech-${chassis}`, 'lod0');
    // Bail if the player clicked to another chassis while this was in flight.
    if (!src || this.chassis !== chassis || this.current !== group) return;
    const model = fitToHeight(orientToGameForward(instantiate(src)), height);
    group.clear();
    group.add(model);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose();
    this.renderer = null;
  }
}

export class HangarScreen {
  private el: HTMLElement;
  private tab: Tab = 'bays';
  private selectedIid: string | null = null;
  /** requisition-tab inspector subject — ANY catalog chassis, owned or not */
  private previewChassis: string | null = null;
  private pickerBay: number | null = null;
  private modal: Modal = null;
  private err = '';
  private note = '';
  private filterClass: string | null = null;
  private filterUnslotted = false;
  private search = '';
  private sort: 'mass' | 'name' | 'newest' = 'mass';
  private expanded = new Set<string>();
  private turntable = new Turntable();
  private coachStep = 0; // 1..3 while showing, 0 done
  private onStorage = (): void => this.render();
  // document-level so Escape works even when focus sits on <body> (the normal
  // state right after a re-render) — removed in close()
  private onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (this.modal) { this.modal = null; this.render(); return; }
    if (this.pickerBay !== null) { this.pickerBay = null; this.render(); return; }
    this.close();
  };

  constructor(
    private container: HTMLElement,
    private svc: HangarService,
    private store: ProfileStore,
    private profile: () => Profile | null,
    private onClose: () => void,
    private playSfx?: (id: string, volume?: number) => void,
  ) {
    if (!document.getElementById('hangar-css')) {
      const style = document.createElement('style');
      style.id = 'hangar-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.el = document.createElement('div');
    this.el.id = 'hangarscreen';
    container.appendChild(this.el);
    document.addEventListener('keydown', this.onKeydown);
    // resilience: hangar state changed under us (another tab) → re-render from store
    window.addEventListener('storage', this.onStorage);
  }

  show(): void {
    const id = this.profile()?.callsign.toLowerCase() ?? 'guest';
    const seen = (localStorage.getItem(COACH_KEY) ?? '').split(',');
    this.coachStep = seen.includes(id) ? 0 : 1;
    this.render();
  }

  private close(): void {
    this.turntable.destroy();
    document.removeEventListener('keydown', this.onKeydown);
    window.removeEventListener('storage', this.onStorage);
    this.el.remove();
    this.onClose();
  }

  private sfx(id: string, vol = 0.7): void {
    this.playSfx?.(id, vol);
  }

  private markCoachDone(): void {
    const id = this.profile()?.callsign.toLowerCase() ?? 'guest';
    const seen = new Set((localStorage.getItem(COACH_KEY) ?? '').split(',').filter(Boolean));
    seen.add(id);
    localStorage.setItem(COACH_KEY, [...seen].join(','));
  }

  // ---------- render ----------

  private render(): void {
    const acct = this.svc.account(this.profile());
    const bad = checkInvariants(acct);
    if (bad.length) this.err = `Hangar state error: ${bad[0]}`;
    if (this.selectedIid && !acct.hangar.frames[this.selectedIid]) this.selectedIid = null;
    if (!this.selectedIid) {
      this.selectedIid = acct.hangar.slots.find((s) => s.iid)?.iid
        ?? Object.keys(acct.hangar.frames)[0] ?? null;
    }

    this.el.innerHTML = `
      <div class="hg-top">
        <div>
          <div class="hg-title">THE HANGAR</div>
          <div class="hg-sub">FREE VEYRAN COMPACT — CHIEF OKAFOR'S SERVICE BAY</div>
        </div>
        <div class="hg-tabs" role="tablist">
          <button class="tab ${this.tab === 'bays' ? 'on' : ''}" data-tab="bays" role="tab" aria-selected="${this.tab === 'bays'}">COLLECTION &amp; BAYS</button>
          <button class="tab ${this.tab === 'requisition' ? 'on' : ''}" data-tab="requisition" role="tab" aria-selected="${this.tab === 'requisition'}">REQUISITION</button>
        </div>
        <div class="hg-wallet" role="status" aria-label="Wallet: ${acct.scrip} scrip">◈ ${acct.scrip.toLocaleString()} SCRIP</div>
        <button id="hg-close" aria-label="Close hangar">◂ BACK</button>
      </div>
      <div class="hg-err" role="alert">${this.err}</div>
      ${this.note ? `<div class="hg-note">${this.note}</div>` : ''}
      <div class="hg-main">
        ${this.tab === 'bays' ? this.renderCollection(acct) : this.renderRequisition(acct)}
        ${this.renderInspector(acct)}
      </div>
      ${this.renderRail(acct)}
      ${this.renderModal(acct)}
      ${this.renderCoach()}
    `;
    this.wire(acct);
    // a re-render wipes focus to <body>; land it somewhere keyboard users can
    // continue from (never steal from an input/modal the wiring just focused)
    if (document.activeElement === document.body) {
      this.el.querySelector<HTMLButtonElement>('#hg-close')?.focus();
    }
  }

  private frameRows(acct: Account, chassis: string, picker: boolean): string {
    const frames = Object.values(acct.hangar.frames)
      .filter((f) => f.chassis === chassis)
      .sort((a, b) => a.at - b.at);
    return frames.map((f) => {
      const bay = bayOf(acct, f.iid);
      if (picker && bay > 0) return '';
      const sel = f.iid === this.selectedIid;
      return `<div class="inst-row ${sel ? 'sel' : ''}">
        <span class="lbl">${this.svc.frameLabel(f)}</span>
        ${bay > 0 ? `<span class="tag">IN BAY ${bay}</span>` : ''}
        <span class="via">${f.via.toUpperCase()}</span>
        ${picker
    ? `<button data-pick="${f.iid}">ASSIGN ▸</button>`
    : `<button data-selinst="${f.iid}" aria-label="Inspect ${this.svc.frameLabel(f)}">INSPECT</button>`}
      </div>`;
    }).join('');
  }

  private renderCollection(acct: Account): string {
    const picker = this.pickerBay !== null;
    const counts = new Map<string, number>();
    for (const f of Object.values(acct.hangar.frames)) counts.set(f.chassis, (counts.get(f.chassis) ?? 0) + 1);

    let ids = [...counts.keys()];
    if (this.filterClass) ids = ids.filter((c) => MECHS[c]?.class === this.filterClass);
    if (this.search) ids = ids.filter((c) => (MECHS[c]?.name ?? c).toLowerCase().includes(this.search.toLowerCase()));
    if (this.filterUnslotted || picker) {
      ids = ids.filter((c) => Object.values(acct.hangar.frames)
        .some((f) => f.chassis === c && bayOf(acct, f.iid) === 0) || picker);
    }
    ids.sort((a, b) => this.sort === 'name'
      ? (MECHS[a]?.name ?? a).localeCompare(MECHS[b]?.name ?? b)
      : this.sort === 'newest'
        ? Math.max(...Object.values(acct.hangar.frames).filter((f) => f.chassis === b).map((f) => f.at))
          - Math.max(...Object.values(acct.hangar.frames).filter((f) => f.chassis === a).map((f) => f.at))
        : (MECHS[a]?.tons ?? 0) - (MECHS[b]?.tons ?? 0));

    const cards = ids.map((c) => {
      const def = MECHS[c];
      const n = counts.get(c) ?? 0;
      const open = this.expanded.has(c) || picker || n === 0;
      const allSlotted = !Object.values(acct.hangar.frames).some((f) => f.chassis === c && bayOf(acct, f.iid) === 0);
      const dupPrice = this.svc.catalogPrice(c);
      const dupShort = dupPrice - acct.scrip;
      const dupHint = picker && allSlotted
        ? `<div class="picker-hint">🔒 Every ${def.name.toUpperCase()} you own is already deployed.
            Own a second ${def.name.toUpperCase()} to field two.
            <button data-reqdup="${c}" ${dupShort > 0 ? 'disabled' : ''}>REQUISITION DUPLICATE — ◈ ${dupPrice.toLocaleString()}</button>
            ${dupShort > 0 ? `<br>◈ ${dupShort.toLocaleString()} short — scrip comes from campaign missions and multiplayer matches.` : ''}</div>`
        : '';
      return `<div class="chassis-card">
        <button class="chassis-head" data-expand="${c}" aria-expanded="${open}">
          <span class="sil" aria-hidden="true">${def.name.slice(0, 2).toUpperCase()}</span>
          <span><span class="nm">${def.name.toUpperCase()}</span><br>
            <span class="cls">${CLASS_LABEL[def.class]} · ${def.tons}T · ${loadoutSummary(c)}</span></span>
          <span class="owned">×${n} OWNED</span>
        </button>
        ${open ? this.frameRows(acct, c, picker) + dupHint : ''}
      </div>`;
    }).join('');

    const pickerHead = picker
      ? `<div class="picker-hint">ASSIGNING TO BAY ${this.pickerBay! + 1} — pick an unslotted frame below, or
          <button data-cancelpick="1">CANCEL</button></div>`
      : '';

    return `<div class="hg-left" id="hg-collection">
      <div class="hg-panehead">COLLECTION — ${Object.keys(acct.hangar.frames).length} FRAME${Object.keys(acct.hangar.frames).length === 1 ? '' : 'S'}
        <div class="hg-filters" role="group" aria-label="Filters">
          ${['light', 'medium', 'heavy', 'assault'].map((k) =>
    `<button data-fclass="${k}" class="${this.filterClass === k ? 'on' : ''}">${CLASS_LABEL[k]}</button>`).join('')}
          <button data-funslot="1" class="${this.filterUnslotted ? 'on' : ''}">UNSLOTTED</button>
          <button data-sort="1">SORT: ${this.sort.toUpperCase()}</button>
          <input class="hg-search" placeholder="SEARCH" value="${esc(this.search)}" aria-label="Search chassis" />
        </div>
      </div>
      <div class="hg-scroll">${pickerHead}${cards ||
        '<div class="hg-note">No frames match the filter. If your collection looks empty, your save may be damaged — progress is stored in this browser; there is nothing to restore from a server yet.</div>'}</div>
    </div>`;
  }

  private renderRequisition(acct: Account): string {
    void acct;
    const counts = this.svc.ownedCounts(this.profile());
    const preview = this.catalogPreviewChassis();
    const rows = [...this.svc.env.catalog.entries()]
      .filter(([, e]) => e.available)
      .sort((a, b) => (MECHS[a[0]]?.tons ?? 0) - (MECHS[b[0]]?.tons ?? 0))
      .map(([c, e]) => {
        const def = MECHS[c];
        const n = counts.get(c) ?? 0;
        return `<div class="req-row ${c === preview ? 'sel' : ''}">
          <button class="req-view" data-preview="${c}" aria-label="View ${def.name} in the inspector">
            <span class="sil" aria-hidden="true" style="width:34px;height:34px;border:1px solid rgba(126,230,176,.4);display:flex;align-items:center;justify-content:center;color:#7ee6b0;flex:none;">${def.name.slice(0, 2).toUpperCase()}</span>
            <span><span class="nm">${def.name.toUpperCase()}</span><br>
              <span class="meta">${CLASS_LABEL[def.class]} · ${def.tons}T · ${def.speedKmh} KM/H · ${loadoutSummary(c)}</span></span>
          </button>
          <span class="price">◈ ${e.price.toLocaleString()}</span>
          <button class="primary" data-buy="${c}"
            aria-label="${n > 0 ? `Owned ${n}, buy another ${def.name} for ${e.price} scrip` : `Buy ${def.name} for ${e.price} scrip`}">
            ${n > 0 ? `OWNED ×${n} — BUY ANOTHER` : 'REQUISITION'}</button>
        </div>`;
      }).join('');
    return `<div class="hg-left">
      <div class="hg-panehead">REQUISITION — OKAFOR'S SUPPLY CATALOG</div>
      <div class="hg-note">Click any chassis to view it on the pad — owned or not.
        Every purchase delivers a NEW frame instance with its own loadout and history.
        Scrip comes from campaign missions, optional objectives, and multiplayer match rewards.</div>
      <div class="hg-scroll">${rows}</div>
    </div>`;
  }

  /** The chassis on the pad while browsing the catalog: the clicked row, else
   *  the lightest available entry — the inspector is never empty here. */
  private catalogPreviewChassis(): string | null {
    if (this.previewChassis && this.svc.env.catalog.get(this.previewChassis)?.available) return this.previewChassis;
    const first = [...this.svc.env.catalog.entries()]
      .filter(([, e]) => e.available)
      .sort((a, b) => (MECHS[a[0]]?.tons ?? 0) - (MECHS[b[0]]?.tons ?? 0))[0];
    return first ? first[0] : null;
  }

  private renderInspector(acct: Account): string {
    // catalog browsing: preview ANY chassis on the pad. Strictly a preview —
    // no assign/rename/scrap; only owned instances are ever slottable (Rule 1).
    if (this.tab === 'requisition') {
      const chassis = this.catalogPreviewChassis();
      if (!chassis) {
        return `<div class="hg-right"><div class="hg-panehead">INSPECTOR</div>
          <div class="hg-note">The catalog is empty.</div></div>`;
      }
      const def = MECHS[chassis];
      const price = this.svc.catalogPrice(chassis);
      const owned = this.svc.ownedCounts(this.profile()).get(chassis) ?? 0;
      const hp = def.hardpoints.map((h) => h[0].toUpperCase()).join(' ');
      const badge = owned > 0
        ? `<span style="font-size:9px;color:#ffb347;border:1px solid rgba(255,179,71,.5);padding:1px 5px;">OWNED ×${owned}</span>`
        : '<span style="font-size:9px;color:rgba(126,230,176,.7);border:1px solid rgba(126,230,176,.4);padding:1px 5px;">NOT OWNED</span>';
      return `<div class="hg-right">
        <div class="hg-panehead">CATALOG PREVIEW — ${def.name.toUpperCase()} ${badge}</div>
        <div id="hg-turn-slot"></div>
        <div class="hg-scroll"><div class="hg-stats">
          <b>CHASSIS</b> ${def.name.toUpperCase()} — ${CLASS_LABEL[def.class]}<br>
          <b>MASS</b> ${def.tons} T · <b>SPEED</b> ${def.speedKmh} KM/H · <b>TWIST</b> ${def.twistArcDeg}°<br>
          <b>HEAT SINKS</b> ${def.heatSinks} · <b>JUMP JETS</b> ${def.jumpJets ? 'YES' : 'NO'}<br>
          <b>HARDPOINTS</b> ${hp} (${def.hardpoints.length})<br>
          <b>STOCK LOADOUT</b> ${loadoutSummary(chassis)}<br>
          <b>ROLE</b> ${def.role}
        </div></div>
        <div class="hg-actions">
          <button class="primary" id="hg-req-buy">${owned > 0 ? `BUY ANOTHER — ◈ ${price.toLocaleString()}` : `REQUISITION — ◈ ${price.toLocaleString()}`}</button>
          ${owned > 0 ? '' : '<span style="font-size:9px;color:rgba(126,230,176,.6);letter-spacing:1px;align-self:center;">Purchase to add it to your Collection and bays.</span>'}
        </div>
      </div>`;
    }
    const f = this.selectedIid ? acct.hangar.frames[this.selectedIid] : null;
    if (!f) {
      return `<div class="hg-right"><div class="hg-panehead">INSPECTOR</div>
        <div class="hg-note">Select a frame to inspect it.</div></div>`;
    }
    const def = MECHS[f.chassis];
    const bay = bayOf(acct, f.iid);
    const hp = def.hardpoints.map((h) => h[0].toUpperCase()).join(' ');
    return `<div class="hg-right">
      <div class="hg-panehead">INSPECTOR — ${this.svc.frameLabel(f).toUpperCase()}
        ${bay > 0 ? `<span class="tag" style="font-size:9px;color:#ffb347;border:1px solid rgba(255,179,71,.5);padding:1px 5px;">BAY ${bay}</span>` : ''}</div>
      <div id="hg-turn-slot"></div>
      <div class="hg-scroll"><div class="hg-stats">
        <b>CHASSIS</b> ${def.name.toUpperCase()} — ${CLASS_LABEL[def.class]}<br>
        <b>MASS</b> ${def.tons} T · <b>SPEED</b> ${def.speedKmh} KM/H · <b>TWIST</b> ${def.twistArcDeg}°<br>
        <b>HEAT SINKS</b> ${def.heatSinks} · <b>JUMP JETS</b> ${def.jumpJets ? 'YES' : 'NO'}<br>
        <b>HARDPOINTS</b> ${hp} (${def.hardpoints.length})<br>
        <b>LOADOUT</b> ${loadoutSummary(f.chassis)}<br>
        <b>ACQUIRED</b> ${f.via.toUpperCase()} · ${new Date(f.at).toLocaleDateString()}<br>
        <b>ROLE</b> ${def.role}
      </div></div>
      <div class="hg-actions">
        <button class="primary" id="hg-assign">${bay > 0 ? 'MOVE TO BAY…' : 'ASSIGN TO BAY…'}</button>
        <button id="hg-editloadout" title="The refit console is still being fitted — loadouts run stock in this build.">EDIT LOADOUT</button>
        <button id="hg-rename">RENAME</button>
        <button id="hg-scrap">SCRAP — ◈ ${Math.floor((this.svc.catalogPrice(f.chassis) * 50) / 100).toLocaleString()} BACK</button>
      </div>
    </div>`;
  }

  private renderRail(acct: Account): string {
    const nextLocked = acct.hangar.slots.findIndex((s) => s.state === 'locked');
    const chips = acct.hangar.slots.map((s, i) => {
      const price = this.svc.bayPrice(i);
      if (s.state === 'unlocked' && s.iid && acct.hangar.frames[s.iid]) {
        const f = acct.hangar.frames[s.iid];
        const def = MECHS[f.chassis];
        const sel = s.iid === this.selectedIid;
        return `<div class="bay occupied ${sel ? 'sel' : ''}" role="group" aria-label="Bay ${i + 1}: ${this.svc.frameLabel(f)}">
          <button class="clear" data-clearbay="${i}" aria-label="Clear bay ${i + 1}">✕</button>
          <button style="all:unset;cursor:pointer;display:block;width:100%;" data-selbay="${i}">
            <div class="bn">BAY ${i + 1} — DEPLOYED</div>
            <div class="bt">${this.svc.frameLabel(f).toUpperCase()}</div>
            <div class="bs">${def.tons}T · ${loadoutSummary(f.chassis)}</div>
          </button>
        </div>`;
      }
      if (s.state === 'unlocked') {
        return `<button class="bay empty" data-assignbay="${i}" aria-label="Bay ${i + 1} empty, assign a frame">
          <div class="bn">BAY ${i + 1}</div><div class="bt">+ ASSIGN</div><div class="bs">empty bay</div>
        </button>`;
      }
      if (i === nextLocked) {
        const afford = acct.scrip >= price;
        return `<button class="bay locked" data-unlockbay="${i}" ${afford ? '' : 'disabled'}
          aria-label="Bay ${i + 1} locked, unlock for ${price} scrip${afford ? '' : `, you are ${price - acct.scrip} short`}">
          <div class="bn">🔒 BAY ${i + 1} — LOCKED</div>
          <div class="bt">UNLOCK — ◈ ${price.toLocaleString()}</div>
          <div class="bs">${afford ? 'tap to unlock' : `◈ ${(price - acct.scrip).toLocaleString()} short`}</div>
        </button>`;
      }
      return `<div class="bay locked later" role="note" aria-label="Bay ${i + 1} locked, unlock bay ${i} first" title="Unlock Bay ${i} first">
        <div class="bn">🔒 BAY ${i + 1}</div><div class="bt">◈ ${price.toLocaleString()}</div><div class="bs">unlock Bay ${i} first</div>
      </div>`;
    }).join('');
    return `<div class="hg-rail" id="hg-rail" role="list" aria-label="Deployment bays — these six bays are your multiplayer deck">${chips}</div>`;
  }

  private renderModal(acct: Account): string {
    const m = this.modal;
    if (!m) return '';
    if (m.kind === 'unlockBay') {
      const price = this.svc.bayPrice(m.bay);
      return `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="Unlock bay ${m.bay + 1}">
        <div class="mh">UNLOCK BAY ${m.bay + 1}</div>
        <div class="mb">Price <b style="color:#ffb347">◈ ${price.toLocaleString()}</b> · balance after
          <b style="color:#ffb347">◈ ${(acct.scrip - price).toLocaleString()}</b><br>
          Permanent, account-wide. One more machine in every multiplayer drop.</div>
        <div class="btnrow"><button class="primary" id="hg-mod-ok">UNLOCK</button><button id="hg-mod-cancel">CANCEL</button></div>
      </div></div>`;
    }
    if (m.kind === 'purchase') {
      const def = MECHS[m.chassis];
      const price = this.svc.catalogPrice(m.chassis);
      const owned = this.svc.ownedCounts(this.profile()).get(m.chassis) ?? 0;
      const short = price - acct.scrip;
      const funds = short > 0
        ? `<b style="color:#ff8873">Insufficient scrip — ◈ ${short.toLocaleString()} short.</b><br>
           Scrip comes from campaign missions, optional objectives, and multiplayer match rewards.`
        : `balance after <b style="color:#ffb347">◈ ${(acct.scrip - price).toLocaleString()}</b><br>
           Delivered as a NEW instance with its own loadout, paint, and history.`;
      return `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="Requisition ${def.name}">
        <div class="mh">REQUISITION — ${def.name.toUpperCase()}${owned ? ` (COPY ${owned + 1})` : ''}</div>
        <div class="mb">Price <b style="color:#ffb347">◈ ${price.toLocaleString()}</b> · ${funds}</div>
        <div class="btnrow"><button class="primary" id="hg-mod-ok" ${short > 0 ? 'disabled' : ''}>CONFIRM PURCHASE</button><button id="hg-mod-cancel">CANCEL</button></div>
      </div></div>`;
    }
    if (m.kind === 'scrap') {
      const f = acct.hangar.frames[m.iid];
      if (!f) { return ''; }
      const refund = Math.floor((this.svc.catalogPrice(f.chassis) * 50) / 100);
      const bay = bayOf(acct, f.iid);
      return `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="Scrap ${this.svc.frameLabel(f)}">
        <div class="mh">SCRAP ${this.svc.frameLabel(f).toUpperCase()}?</div>
        <div class="mb">1 — The frame is <b style="color:#ff5533">destroyed permanently</b>.<br>
          2 — You are refunded <b style="color:#ffb347">◈ ${refund.toLocaleString()}</b> (50% of catalog).<br>
          3 — ${bay > 0 ? `Bay ${bay} becomes <b>EMPTY</b>.` : 'It occupies no bay — the rail is unchanged.'}</div>
        <div class="btnrow">
          ${m.confirmed
    ? '<button class="primary" id="hg-mod-ok">CONFIRM — SCRAP IT</button>'
    : '<button id="hg-mod-first">I UNDERSTAND — CONTINUE</button>'}
          <button id="hg-mod-cancel">KEEP IT</button></div>
      </div></div>`;
    }
    const f = acct.hangar.frames[m.iid];
    return `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="Rename frame">
      <div class="mh">RENAME ${f ? this.svc.frameLabel(f).toUpperCase() : ''}</div>
      <div class="mb"><input id="hg-rename-input" maxlength="24" value="${esc(m.draft ?? f?.name ?? '')}"
        placeholder="e.g. Brawler build" aria-label="New frame name" /></div>
      <div class="hg-err" role="alert">${this.err}</div>
      <div class="btnrow"><button class="primary" id="hg-mod-ok">SAVE</button><button id="hg-mod-cancel">CANCEL</button></div>
    </div></div>`;
  }

  private renderCoach(): string {
    if (!this.coachStep) return '';
    const texts: Record<number, [string, string]> = {
      1: ['bottom:96px;left:50%;transform:translateX(-50%);', 'These six bays ARE your multiplayer deck. Bay 1 is on the house — the rest are earned.'],
      2: ['top:120px;left:40px;', 'Everything you own lives in the Collection. Salvage, rewards, purchases — nothing else, ever.'],
      3: ['top:60px;left:50%;transform:translateX(-50%);', 'Short on frames? Okafor’s Requisition sells every chassis — duplicates too. "Want two in the field? Buy two."'],
    };
    const [pos, text] = texts[this.coachStep];
    return `<div class="coach" style="${pos}" role="note">${text}<br>
      <button id="hg-coach-next" class="primary" style="margin-top:6px;">${this.coachStep < 3 ? 'NEXT ▸' : 'GOT IT'}</button></div>`;
  }

  // ---------- event wiring ----------

  private q<T extends HTMLElement>(sel: string): T | null {
    return this.el.querySelector<T>(sel);
  }

  private wire(acct: Account): void {
    this.q<HTMLButtonElement>('#hg-close')!.onclick = () => this.close();
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
      b.onclick = () => { this.tab = b.dataset.tab as Tab; this.err = ''; this.pickerBay = null; this.render(); };
    }

    // coach marks
    const coach = this.q<HTMLButtonElement>('#hg-coach-next');
    if (coach) {
      coach.onclick = () => {
        this.sfx('ui.bt.confirm', 0.5);
        this.coachStep = this.coachStep >= 3 ? 0 : this.coachStep + 1;
        if (!this.coachStep) this.markCoachDone();
        this.render();
      };
      coach.focus();
    }

    // collection
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-expand]')) {
      b.onclick = () => {
        const c = b.dataset.expand!;
        if (this.expanded.has(c)) this.expanded.delete(c); else this.expanded.add(c);
        this.render();
      };
    }
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-selinst]')) {
      b.onclick = () => { this.selectedIid = b.dataset.selinst!; this.err = ''; this.sfx('sfx.lock', 0.4); this.render(); };
    }
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-fclass]')) {
      b.onclick = () => { this.filterClass = this.filterClass === b.dataset.fclass ? null : b.dataset.fclass!; this.render(); };
    }
    const un = this.q<HTMLButtonElement>('[data-funslot]');
    if (un) un.onclick = () => { this.filterUnslotted = !this.filterUnslotted; this.render(); };
    const so = this.q<HTMLButtonElement>('[data-sort]');
    if (so) {
      so.onclick = () => {
        this.sort = this.sort === 'mass' ? 'name' : this.sort === 'name' ? 'newest' : 'mass';
        this.render();
      };
    }
    const search = this.q<HTMLInputElement>('.hg-search');
    if (search) {
      search.oninput = () => {
        this.search = search.value;
        const pos = search.selectionStart;
        this.render();
        const again = this.q<HTMLInputElement>('.hg-search');
        if (again) { again.focus(); again.setSelectionRange(pos, pos); }
      };
    }

    // picker
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-pick]')) {
      b.onclick = () => {
        const bay = this.pickerBay;
        this.pickerBay = null;
        if (bay === null) return;
        const r = this.svc.assign(this.profile(), bay, b.dataset.pick!);
        if (r.ok) { this.sfx('ui.bt.confirm', 0.8); this.selectedIid = b.dataset.pick!; this.err = ''; }
        else { this.sfx('ui.bt.hint', 0.5); this.err = errorCopy(r); }
        this.render();
      };
    }
    const cp = this.q<HTMLButtonElement>('[data-cancelpick]');
    if (cp) cp.onclick = () => { this.pickerBay = null; this.render(); };
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-reqdup]')) {
      b.onclick = () => {
        this.modal = { kind: 'purchase', chassis: b.dataset.reqdup!, key: crypto.randomUUID() };
        this.render();
      };
    }

    // requisition
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-preview]')) {
      b.onclick = () => {
        this.previewChassis = b.dataset.preview!;
        this.err = '';
        this.sfx('sfx.lock', 0.4);
        this.render();
      };
    }
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-buy]')) {
      b.onclick = () => {
        this.previewChassis = b.dataset.buy!; // show what's being bought on the pad
        this.modal = { kind: 'purchase', chassis: b.dataset.buy!, key: crypto.randomUUID() };
        this.render();
      };
    }
    const reqBuy = this.q<HTMLButtonElement>('#hg-req-buy');
    if (reqBuy) {
      reqBuy.onclick = () => {
        const chassis = this.catalogPreviewChassis();
        if (!chassis) return;
        this.modal = { kind: 'purchase', chassis, key: crypto.randomUUID() };
        this.render();
      };
    }

    // rail
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-selbay]')) {
      b.onclick = () => {
        this.selectedIid = acct.hangar.slots[Number(b.dataset.selbay)].iid;
        this.sfx('sfx.lock', 0.4);
        this.render();
      };
    }
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-clearbay]')) {
      b.onclick = (e) => {
        e.stopPropagation();
        const r = this.svc.clear(this.profile(), Number(b.dataset.clearbay));
        this.err = r.ok ? '' : errorCopy(r);
        this.render();
      };
    }
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-assignbay]')) {
      b.onclick = () => {
        this.pickerBay = Number(b.dataset.assignbay);
        this.tab = 'bays';
        this.render();
      };
    }
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-unlockbay]')) {
      b.onclick = () => {
        this.modal = { kind: 'unlockBay', bay: Number(b.dataset.unlockbay), key: crypto.randomUUID() };
        this.render();
      };
    }
    // arrow-key navigation along the rail
    const rail = this.q<HTMLDivElement>('#hg-rail');
    if (rail) {
      rail.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const focusables = [...rail.querySelectorAll<HTMLButtonElement>('button:not(.clear)')];
        const i = focusables.indexOf(document.activeElement as HTMLButtonElement);
        if (i < 0) return;
        e.preventDefault();
        focusables[Math.max(0, Math.min(focusables.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))].focus();
      });
    }

    // inspector actions
    const asg = this.q<HTMLButtonElement>('#hg-assign');
    if (asg) {
      asg.onclick = () => {
        // choose the first empty unlocked bay; else first unlocked (swap target)
        const iid = this.selectedIid!;
        const slots = acct.hangar.slots;
        let bay = slots.findIndex((s) => s.state === 'unlocked' && s.iid === null);
        if (bay < 0) bay = slots.findIndex((s) => s.state === 'unlocked' && s.iid !== iid);
        if (bay < 0) { this.err = 'No unlocked bay available.'; this.render(); return; }
        const r = this.svc.assign(this.profile(), bay, iid);
        if (r.ok) { this.sfx('ui.bt.confirm', 0.8); this.err = ''; this.note = `Assigned to Bay ${bay + 1}.`; }
        else this.err = errorCopy(r);
        this.render();
        this.note = '';
      };
    }
    const editBtn = this.q<HTMLButtonElement>('#hg-editloadout');
    if (editBtn) {
      editBtn.onclick = () => {
        this.err = '';
        this.note = 'The refit console is still being fitted — every frame runs its stock loadout in this build.';
        this.render();
        this.note = '';
      };
    }
    const ren = this.q<HTMLButtonElement>('#hg-rename');
    if (ren) ren.onclick = () => { this.modal = { kind: 'rename', iid: this.selectedIid! }; this.render(); };
    const scr = this.q<HTMLButtonElement>('#hg-scrap');
    if (scr) {
      scr.onclick = () => {
        this.modal = { kind: 'scrap', iid: this.selectedIid!, key: crypto.randomUUID(), confirmed: false };
        this.render();
      };
    }

    // turntable re-attach: catalog preview on the requisition tab, the
    // selected owned instance everywhere else
    const slot = this.q<HTMLDivElement>('#hg-turn-slot');
    if (slot) {
      const chassis = this.tab === 'requisition'
        ? this.catalogPreviewChassis()
        : (this.selectedIid ? acct.hangar.frames[this.selectedIid]?.chassis ?? null : null);
      if (chassis) {
        slot.replaceWith(this.turntable.el);
        this.turntable.show(chassis);
      }
    }

    // modal buttons
    const cancel = this.q<HTMLButtonElement>('#hg-mod-cancel');
    if (cancel) cancel.onclick = () => { this.modal = null; this.render(); };
    const first = this.q<HTMLButtonElement>('#hg-mod-first');
    if (first) {
      first.onclick = () => {
        if (this.modal?.kind === 'scrap') this.modal.confirmed = true;
        this.render();
      };
    }
    const ok = this.q<HTMLButtonElement>('#hg-mod-ok');
    if (ok) {
      ok.onclick = () => this.confirmModal();
      ok.focus();
    }
  }

  private confirmModal(): void {
    const m = this.modal;
    if (!m) return;
    const p = this.profile();
    if (m.kind === 'unlockBay') {
      const r = this.svc.unlockBay(p, m.bay, m.key);
      if (r.ok) { this.sfx('sfx.servo', 0.8); this.err = ''; this.note = `Bay ${m.bay + 1} unlocked. One more machine in every drop.`; }
      else { this.sfx('ui.bt.hint', 0.5); this.err = errorCopy(r); }
    } else if (m.kind === 'purchase') {
      const r = this.svc.purchase(p, m.chassis, m.key);
      if (r.ok) {
        this.sfx('ui.bt.confirm', 0.9);
        this.err = '';
        this.note = `${MECHS[m.chassis]?.name.toUpperCase()} delivered to the Collection as a new instance.`;
        this.selectedIid = (r as { iid?: string }).iid ?? this.selectedIid;
        this.tab = 'bays';
      } else { this.sfx('ui.bt.hint', 0.5); this.err = errorCopy(r); }
    } else if (m.kind === 'scrap') {
      const r = this.svc.scrap(p, m.iid, m.key);
      if (r.ok) { this.sfx('sfx.collapse', 0.35); this.err = ''; this.note = `Scrapped — ◈ ${(r as { refund?: number }).refund ?? 0} refunded.`; this.selectedIid = null; }
      else { this.sfx('ui.bt.hint', 0.5); this.err = errorCopy(r); }
    } else if (m.kind === 'rename') {
      const input = this.q<HTMLInputElement>('#hg-rename-input');
      const r = this.svc.rename(p, m.iid, input?.value ?? '');
      if (r.ok) this.err = '';
      else {
        // keep the modal open to retry: preserve the draft, surface the error
        m.draft = input?.value ?? '';
        this.err = errorCopy(r);
        this.sfx('ui.bt.hint', 0.5);
        this.render();
        this.q<HTMLInputElement>('#hg-rename-input')?.focus();
        return;
      }
    }
    this.modal = null;
    this.render();
    this.note = '';
  }
}
