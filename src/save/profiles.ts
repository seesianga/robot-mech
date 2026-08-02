/**
 * Pilot accounts and campaign progress — stored in the service database
 * (Cloudflare D1 behind /api, see server/accountcore.mjs), so a pilot signs in
 * from any device and finds the same campaign, hangar and wallet.
 *
 * SHAPE OF THE THING
 * ------------------
 * The registry is authoritative; this device keeps a write-through cache in
 * localStorage. Mutations stay SYNCHRONOUS — `completeStage()` returns before
 * anything touches the network — and a debounced flush pushes them. That is
 * deliberate: a mission ending must never block on a round trip, and a pilot on
 * a train must keep playing. What the network buys is durability and reach, not
 * the write itself.
 *
 * Every push carries the revision it was based on. If the service has moved on
 * (the same pilot played on another device), the push is REJECTED rather than
 * applied, and the two copies are folded together by the merge in
 * server/progressmerge.mjs — which is monotonic, so no unlock, frame or bay is
 * ever lost to a merge.
 *
 * Offline is a first-class state, not an error:
 *   - Signed in already? Play on. Edits queue and flush when the link returns.
 *   - Signing in on a device that has this pilot cached? A locally stored
 *     verifier digest gates it, so the passcode still has to be right.
 *   - Never signed in here and no link? That one genuinely cannot work — the
 *     UI says so and offers guest play.
 *
 * Guests are unchanged: sessionStorage, gone with the tab, never synced.
 */

import type { HangarState } from '../../server/hangarcore.mjs';
import { mergeProgress } from '../../server/progressmerge.mjs';
import { MIN_PASSCODE, assertCallsign, sha256hex } from '../../server/credentials.mjs';
import { CloudClient, CloudError, OfflineError, deriveVerifier, deviceLabel, type CloudProgress, type CloudSession } from './cloud';

export interface Progress {
  unlocked: number; // highest stage the pilot may launch (1-based)
  scrip: number;
  completed: Record<number, { scrip: number; at: number }>;
  /** basic_training_complete: Basic Training finished OR skipped — same flag either way */
  tutorialDone?: boolean;
  /** Basic Training phases fully confirmed (quick-jump chips in the menu) */
  btPhases?: string[];
  /** the M21 fork the pilot took — tints M22–M24 and picks the M24 ending */
  branch21?: 'a' | 'b';
  /** collection + Deployment Bays — owned by server/hangarcore.mjs via HangarService */
  hangar?: HangarState;
}

export interface Profile {
  /** service account id — the identity that survives devices */
  id: string;
  callsign: string;
  createdAt: number;
  progress: Progress;
}

/** What the sync engine is doing, for the status line on the start screen. */
export type SyncState = 'clean' | 'pending' | 'syncing' | 'offline' | 'error' | 'signed-out';

export interface SyncStatus {
  state: SyncState;
  /** player-facing detail for 'error' / 'signed-out' */
  message?: string;
  lastSyncedAt?: number;
}

interface CacheRecord {
  id: string;
  callsign: string;
  createdAt: number;
  token: string;
  expiresAt: number;
  rev: number;
  progress: Progress;
  /** local edits the service has not acknowledged */
  dirty: boolean;
  /** sha256 of the client verifier — gates offline sign-in on this device */
  verifierDigest: string;
  lastSyncedAt: number;
}

interface CacheFile {
  v: 3;
  /** the pilot signed in on this device; '' when nobody is */
  activeId: string;
  accounts: Record<string, CacheRecord>;
}

/**
 * One record PER PILOT, not one per device. A pilot who signs out with edits
 * still queued keeps their record parked here, and signing in as somebody else
 * must never be the thing that deletes it — the parked copy is picked up and
 * merged the next time that pilot signs in.
 */
const CACHE = 'veyra.account.v3';
/** pre-map single-record cache, read once and folded into v3 */
const CACHE_V2 = 'veyra.account.v2';
/** parked records kept per pilot; the rest are pruned oldest-first */
const MAX_CACHED_PILOTS = 6;
const DEVICE = 'veyra.device.v1';
const RESUME = 'veyra.resume.v1';
const GUEST = 'veyra.guest.progress.v1';
const BT_JUMP = 'veyra.bt.jump.v1';
/** pre-cloud local profiles, kept for one-way migration */
const LEGACY = 'veyra.profiles.v1';
const LEGACY_SESSION = 'veyra.session.v1';

const PUSH_DEBOUNCE_MS = 600;
const MAX_MERGE_ROUNDS = 4;
const REFRESH_MIN_GAP_MS = 20_000;
/** Resuming a session waits on the registry, so it is deliberately short: a
 *  pilot with a dead link should reach the menu quickly on their cached save,
 *  not sit on a spinner for the full request timeout. */
const RESUME_TIMEOUT_MS = 5000;

interface LegacyProfile {
  callsign: string;
  passHash: string;
  salt: string;
  createdAt: number;
  progress: Progress;
}

function freshProgress(): Progress {
  return { unlocked: 1, scrip: 0, completed: {}, tutorialDone: false };
}

async function legacyHash(salt: string, pass: string): Promise<string> {
  return sha256hex(salt + pass);
}

export class ProfileStore {
  private cloud = new CloudClient();
  private cache: CacheRecord | null = null;
  private status: SyncStatus = { state: 'clean' };
  private listeners = new Set<(s: SyncStatus) => void>();
  private progressListeners = new Set<() => void>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private retryDelay = 2000;
  private lastRefresh = 0;
  /** localStorage refused a write — the in-memory record is the only copy */
  private degraded = false;

  constructor() {
    this.cache = this.readCache();
    if (this.cache?.dirty) this.setStatus({ state: 'pending' });
    if (typeof window !== 'undefined') {
      // a queued save must not die with the tab; keepalive lets the request
      // outlive the page (a plain fetch here is cancelled on unload)
      window.addEventListener('pagehide', () => this.flushBeacon());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flushBeacon();
        else void this.refresh();
      });
      window.addEventListener('online', () => { this.retryDelay = 2000; void this.flush(); });
    }
  }

  // ---------- status ----------

  onSync(fn: (s: SyncStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  syncStatus(): SyncStatus {
    return this.status;
  }

  /** Fires when the stored progress was replaced by a copy from the registry —
   *  the pilot played on another device. Screens showing progress re-render. */
  onProgressChange(fn: () => void): () => void {
    this.progressListeners.add(fn);
    return () => this.progressListeners.delete(fn);
  }

  private notifyProgress(): void {
    for (const fn of this.progressListeners) fn();
  }

  private setStatus(next: SyncStatus): void {
    this.status = next;
    for (const fn of this.listeners) fn(next);
  }

  // ---------- cache ----------

  private readFile(): CacheFile {
    let file: CacheFile = { v: 3, activeId: '', accounts: {} };
    try {
      const raw = localStorage.getItem(CACHE);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheFile;
        if (parsed && typeof parsed === 'object' && parsed.accounts) {
          file = { v: 3, activeId: String(parsed.activeId ?? ''), accounts: parsed.accounts };
        }
      } else {
        // one-time fold-up of the single-record cache this replaced
        const legacy = localStorage.getItem(CACHE_V2);
        if (legacy) {
          const rec = JSON.parse(legacy) as CacheRecord;
          if (rec?.id && rec.callsign) file = { v: 3, activeId: rec.token ? rec.id : '', accounts: { [rec.id]: rec } };
        }
      }
    } catch { /* unreadable cache — start clean rather than wedge the game */ }
    for (const [id, rec] of Object.entries(file.accounts)) {
      if (!rec?.id || !rec.callsign) delete file.accounts[id];
      else rec.progress = { ...freshProgress(), ...(rec.progress ?? {}) };
    }
    return file;
  }

  private writeFile(file: CacheFile): void {
    // keep every pilot with unsynced work; prune the rest oldest-first
    const ids = Object.keys(file.accounts);
    if (ids.length > MAX_CACHED_PILOTS) {
      const droppable = ids
        .filter((id) => id !== file.activeId && !file.accounts[id].dirty)
        .sort((a, b) => (file.accounts[a].lastSyncedAt ?? 0) - (file.accounts[b].lastSyncedAt ?? 0));
      for (const id of droppable.slice(0, ids.length - MAX_CACHED_PILOTS)) delete file.accounts[id];
    }
    try {
      localStorage.setItem(CACHE, JSON.stringify(file));
      localStorage.removeItem(CACHE_V2);
      this.degraded = false;
    } catch {
      // quota exhausted or private mode: the in-memory copy is now the only
      // truth on this device, so live() must stop re-reading over the top of it
      this.degraded = true;
    }
  }

  private readCache(): CacheRecord | null {
    const file = this.readFile();
    return file.activeId ? file.accounts[file.activeId] ?? null : null;
  }

  /** Upsert + activate, or (null) deactivate without ever losing queued work. */
  private writeCache(rec: CacheRecord | null): void {
    this.cache = rec;
    if (this.degraded && !rec) return;
    const file = this.readFile();
    if (rec) {
      file.accounts[rec.id] = rec;
      file.activeId = rec.id;
    } else {
      file.activeId = '';
    }
    this.writeFile(file);
  }

  /** The parked record for a pilot, from a sign-out that still had edits queued. */
  private parked(accountId: string): CacheRecord | null {
    return this.readFile().accounts[accountId] ?? null;
  }

  /**
   * Deactivate the signed-in pilot: strip the session, keep the record.
   *
   * Keeping it is what makes signing back in on this device work with no link
   * (the passcode is still checked against the stored verifier digest), and it
   * is the only place unsynced edits can wait. Records are bounded by
   * MAX_CACHED_PILOTS and pruned clean-and-oldest first, so this cannot grow.
   */
  private deactivate(): void {
    const file = this.readFile();
    const rec = file.activeId ? file.accounts[file.activeId] : null;
    if (rec) file.accounts[rec.id] = { ...rec, token: '', expiresAt: 0 };
    file.activeId = '';
    this.cache = null;
    this.writeFile(file);
  }

  /** Re-read from storage so a write by another tab is never clobbered. When
   *  storage is unwritable the in-memory record is authoritative — re-reading
   *  would silently discard the edit that could not be persisted. */
  private live(): CacheRecord | null {
    if (this.degraded) return this.cache;
    const stored = this.readCache();
    if (stored && this.cache && stored.id === this.cache.id) {
      this.cache = stored;
      return stored;
    }
    return this.cache;
  }

  private deviceId(): string {
    let id = localStorage.getItem(DEVICE);
    if (!id) {
      id = `${deviceLabel()} · ${Math.random().toString(36).slice(2, 8)}`;
      try { localStorage.setItem(DEVICE, id); } catch { /* non-persistent device label is fine */ }
    }
    return id;
  }

  private toProfile(rec: CacheRecord): Profile {
    return { id: rec.id, callsign: rec.callsign, createdAt: rec.createdAt, progress: rec.progress };
  }

  // ---------- identity ----------

  /** The pilot signed in on this device, if any. Synchronous — the cached copy. */
  current(): Profile | null {
    const rec = this.live();
    return rec ? this.toProfile(rec) : null;
  }

  /** Kept for call sites that re-read a profile by name after a mutation. */
  get(callsign: string): Profile | null {
    const rec = this.live();
    if (!rec) return null;
    return rec.callsign.toLowerCase() === String(callsign).toLowerCase() ? this.toProfile(rec) : null;
  }

  signedIn(): boolean {
    return Boolean(this.live()?.token);
  }

  /**
   * Resume the session this device already holds, refreshing from the registry.
   * Returns the pilot even when the registry is unreachable — the cached copy
   * is playable, and the status line says it is offline.
   */
  async restore(): Promise<Profile | null> {
    const rec = this.live();
    if (!rec?.token) return null;
    // The stored expiry is a HINT, not a verdict: the service slides a session
    // every time it is used, so a locally-stale value routinely undershoots the
    // real one. Only the service can say a session has lapsed, so ask it —
    // and never delete the cache on the way, because it may hold queued work.
    try {
      await this.syncNow(rec);
    } catch (e) {
      if (e instanceof CloudError && e.status === 401) {
        this.deactivate();
        this.setStatus({ state: 'signed-out', message: 'Session expired. Sign in again.' });
        return null;
      }
      this.setStatus({ state: 'offline', message: 'Playing offline — changes will sync when the link returns.' });
    }
    const live = this.live();
    // syncNow() routes a dirty record through flush(), which swallows its own
    // errors — so a 401 in there shows up here as a record whose token was
    // stripped, not as a throw. That pilot is signed out, queued work and all.
    if (!live?.token) {
      this.setStatus({ state: 'signed-out', message: 'Session expired. Sign in again.' });
      return null;
    }
    return this.toProfile(live);
  }

  async register(callsign: string, passcode: string): Promise<Profile> {
    const cs = assertCallsign(callsign);
    if (String(passcode).length < MIN_PASSCODE) throw new Error(`Passcode: at least ${MIN_PASSCODE} characters`);
    const session = await this.cloud.register(cs, passcode, this.deviceId()).catch(rethrow);
    await this.adopt(session, passcode);
    // a guest who registers mid-run keeps what they played
    const guest = this.guestProgress();
    // anything the guest actually did counts — including a Basic Training run,
    // which banks no stage and no scrip but still means "do not offer it again"
    if (guest.unlocked > 1 || guest.scrip > 0 || Object.keys(guest.completed).length
      || guest.tutorialDone || guest.btPhases?.length || guest.hangar) {
      this.updateProgress(this.current(), (g) => Object.assign(g, mergeProgress(guest, g)));
      sessionStorage.removeItem(GUEST);
    }
    return this.current()!;
  }

  async login(callsign: string, passcode: string): Promise<Profile> {
    const cs = assertCallsign(callsign);
    try {
      const session = await this.cloud.login(cs, passcode, this.deviceId());
      await this.adopt(session, passcode);
      return this.current()!;
    } catch (e) {
      if (e instanceof OfflineError) {
        const offline = await this.offlineSignIn(cs, passcode);
        if (offline) return offline;
        throw new Error('Cannot reach the pilot registry, and this pilot has never signed in on this device.');
      }
      throw rethrow(e);
    }
  }

  /** Sign in against the cached copy when the registry is unreachable. The
   *  passcode is still checked — against a verifier digest stored at the last
   *  successful sign-in — so this is not a bypass. */
  private async offlineSignIn(callsign: string, passcode: string): Promise<Profile | null> {
    // any pilot cached on this device, not merely the last one signed in —
    // switching pilots on a train has to work too
    const want = callsign.toLowerCase();
    const rec = Object.values(this.readFile().accounts)
      .find((r) => r.callsign.toLowerCase() === want && r.verifierDigest);
    if (!rec) return null;
    const digest = await sha256hex(`veyra.offline.v1|${await deriveVerifier(passcode, callsign)}`);
    if (digest !== rec.verifierDigest) throw new Error('Callsign or passcode not recognised.');
    this.writeCache(rec); // make them the active pilot again
    this.setStatus({ state: 'offline', message: 'Signed in offline — changes will sync when the link returns.' });
    return this.toProfile(rec);
  }

  /** Take a fresh session from the registry, folding in anything this device
   *  had queued for the same pilot. */
  private async adopt(session: CloudSession, passcode: string): Promise<void> {
    // the pilot's OWN parked record — signing out with edits queued keeps it,
    // and signing in as anyone else never touches it (the cache is per pilot)
    const prior = this.parked(session.account.id);
    const carryOver = Boolean(prior?.dirty);
    const progress = carryOver
      ? mergeProgress(prior!.progress, session.progress)
      : { ...freshProgress(), ...session.progress };

    this.writeCache({
      id: session.account.id,
      callsign: session.account.callsign,
      createdAt: session.account.createdAt,
      token: session.token,
      expiresAt: session.expiresAt,
      rev: session.rev,
      progress,
      dirty: Boolean(carryOver),
      verifierDigest: await sha256hex(`veyra.offline.v1|${await deriveVerifier(passcode, session.account.callsign)}`),
      lastSyncedAt: Date.now(),
    });
    if (carryOver) {
      this.setStatus({ state: 'pending' });
      await this.flush();
    } else {
      this.setStatus({ state: 'clean', lastSyncedAt: Date.now() });
    }
  }

  /** Sign out of this device. Local queued edits are pushed first if possible —
   *  signing out must never be the thing that loses a mission. */
  async signOut(): Promise<void> {
    const rec = this.live();
    if (!rec) return;
    if (rec.dirty) { try { await this.flush(); } catch { /* keep going: the cache stays until it syncs */ } }
    const stillDirty = this.live()?.dirty;
    const token = rec.token;
    this.clearSession();
    if (stillDirty) {
      // unsynced work would be lost with the cache — keep it and say so
      this.setStatus({ state: 'signed-out', message: 'Signed out. Unsynced progress is still on this device and will sync at your next sign-in.' });
    }
    if (token) void this.cloud.logout(token).catch(() => { /* the session ages out on its own */ });
  }

  /** Synchronous local sign-out (the UI calls this on "switch pilot"). */
  clearSession(): void {
    if (this.pushTimer) { clearTimeout(this.pushTimer); this.pushTimer = null; }
    // deactivate() keeps a record that still has unsynced work, parked under
    // this pilot's own id — signing in as somebody else cannot touch it, and
    // this pilot's next sign-in merges it back up
    this.deactivate();
    this.setStatus({ state: 'signed-out' });
  }

  // ---------- progress (synchronous; the network catches up) ----------

  /**
   * Unified read-modify-write on the signed-in pilot's (or guest's) progress.
   * Always re-reads the stored copy first, so a mutation from another tab is
   * never clobbered by a stale in-memory Profile. Returns the fresh Progress.
   */
  updateProgress(p: Profile | null, fn: (g: Progress) => void): Progress {
    const rec = this.live();
    if (p && rec && rec.id === p.id) {
      // HangarService.ensure() runs this on every render to bootstrap/repair the
      // hangar, and almost always changes nothing. Only a real change may mark
      // the save dirty, or the menu would push to the registry on every repaint.
      const before = JSON.stringify(rec.progress);
      fn(rec.progress);
      const changed = JSON.stringify(rec.progress) !== before;
      p.progress = rec.progress; // keep the caller's reference current
      if (changed) {
        this.writeCache({ ...rec, dirty: true });
        this.queuePush();
      }
      return rec.progress;
    }
    const g = this.guestProgress();
    fn(g);
    try { sessionStorage.setItem(GUEST, JSON.stringify(g)); } catch { /* nothing to be done */ }
    return g;
  }

  /** Latest stored progress for this identity (re-read, never cached). */
  progressOf(p: Profile | null): Progress {
    const rec = this.live();
    if (p && rec && rec.id === p.id) return rec.progress;
    return p ? p.progress : this.guestProgress();
  }

  save(p: Profile): void {
    this.updateProgress(p, (g) => Object.assign(g, p.progress));
  }

  /** Record a stage win: unlock the next stage (capped) and bank the scrip. */
  completeStage(p: Profile | null, stage: number, scrip: number, maxStage: number): void {
    this.updateProgress(p, (g) => {
      g.unlocked = Math.min(maxStage, Math.max(g.unlocked, stage + 1));
      g.scrip += scrip;
      g.completed[stage] = { scrip, at: Date.now() };
    });
  }

  /** Persist the M21 branch choice the moment the pilot launches the fork. */
  setBranch(p: Profile | null, branch: 'a' | 'b'): void {
    this.updateProgress(p, (g) => { g.branch21 = branch; });
  }

  /** Basic Training completed (or skipped to the end) — same flag either way. */
  markTutorialDone(p: Profile | null): void {
    this.updateProgress(p, (g) => { g.tutorialDone = true; });
  }

  /** Union-merge the Basic Training phases the pilot has fully confirmed. */
  saveBtPhases(p: Profile | null, phases: string[]): void {
    if (!phases.length) return;
    this.updateProgress(p, (g) => {
      g.btPhases = [...new Set([...(g.btPhases ?? []), ...phases])].sort();
    });
  }

  guestProgress(): Progress {
    try {
      return { ...freshProgress(), ...JSON.parse(sessionStorage.getItem(GUEST) ?? '{}') } as Progress;
    } catch {
      return freshProgress();
    }
  }

  // ---------- one-shot hints across the reload boundary ----------

  /** "start Basic Training at this phase". Expires after 2 minutes so a stale
   *  hint can never leak into a later session or a different pilot's launch. */
  setBtPhase(phase: string): void {
    localStorage.setItem(BT_JUMP, JSON.stringify({ phase, at: Date.now() }));
  }

  takeBtPhase(): string | null {
    const phase = this.peekBtPhase();
    localStorage.removeItem(BT_JUMP);
    return phase;
  }

  /** Non-destructive read of the phase hint: launch needs it BEFORE terrain
   *  build to pick the phase's venue, while the mission constructor stays the
   *  one true consumer via takeBtPhase(). */
  peekBtPhase(): string | null {
    const raw = localStorage.getItem(BT_JUMP);
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as { phase: string; at: number };
      return Date.now() - v.at < 120_000 ? v.phase : null;
    } catch {
      return null;
    }
  }

  setResume(stage: number): void {
    localStorage.setItem(RESUME, String(stage));
  }

  takeResume(): number | null {
    const v = localStorage.getItem(RESUME);
    localStorage.removeItem(RESUME);
    return v ? parseInt(v, 10) : null;
  }

  // ---------- sync engine ----------

  private queuePush(): void {
    const rec = this.live();
    if (!rec?.token) return; // offline sign-in or guest: the cache holds it
    this.setStatus({ state: 'pending' });
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => { this.pushTimer = null; void this.flush(); }, PUSH_DEBOUNCE_MS);
  }

  /**
   * Push everything queued and settle. Safe to call at any time; concurrent
   * callers share the one in-flight run. Never throws — the status carries the
   * outcome, because no caller of this can do anything better than keep playing.
   */
  async flush(): Promise<SyncStatus> {
    if (this.inFlight) { await this.inFlight.catch(() => {}); return this.status; }
    const rec = this.live();
    if (!rec?.token || !rec.dirty) return this.status;
    // only now is it safe to drop a scheduled push — we are about to do it
    if (this.pushTimer) { clearTimeout(this.pushTimer); this.pushTimer = null; }

    this.setStatus({ state: 'syncing' });
    this.inFlight = this.pushLoop();
    try {
      await this.inFlight;
    } catch { /* pushLoop sets the status; nothing above it can act on the error */ }
    this.inFlight = null;
    // still queued and nothing scheduled (a mid-flight edit, say) — keep trying
    if (this.live()?.dirty && !this.pushTimer && this.status.state !== 'error' && this.status.state !== 'signed-out') {
      this.scheduleRetry();
    }
    return this.status;
  }

  private async pushLoop(): Promise<void> {
    for (let round = 0; round < MAX_MERGE_ROUNDS; round++) {
      const rec = this.live();
      if (!rec?.token || !rec.dirty) return;
      const snapshot = JSON.stringify(rec.progress);
      try {
        const { rev, sessionExpiresAt } = await this.cloud.pushProgress(rec.token, rec.rev, rec.progress, this.deviceId());
        const after = this.live();
        if (!after || after.id !== rec.id) return;
        // an edit that landed WHILE the push was in flight keeps the record
        // dirty — the next round sends it against the revision we just took
        const changedMidFlight = JSON.stringify(after.progress) !== snapshot;
        this.writeCache({
          ...after,
          rev,
          dirty: changedMidFlight,
          expiresAt: sessionExpiresAt ?? after.expiresAt,
          lastSyncedAt: Date.now(),
        });
        if (!changedMidFlight) {
          this.retryDelay = 2000;
          this.setStatus({ state: 'clean', lastSyncedAt: Date.now() });
          return;
        }
        continue;
      } catch (e) {
        if (e instanceof CloudError && e.status === 409 && e.payload) {
          // the pilot moved on somewhere else — fold the two histories together
          const current = this.live();
          if (!current || current.id !== rec.id) return;
          this.writeCache({
            ...current,
            rev: e.payload.rev,
            progress: mergeProgress(current.progress, e.payload.progress),
            expiresAt: e.payload.sessionExpiresAt ?? current.expiresAt,
            dirty: true,
          });
          continue;
        }
        if (e instanceof CloudError && e.status === 401) {
          // the session is gone, but the queued edits are not: park them under
          // this pilot so their next sign-in merges them up
          const current = this.live();
          if (current && current.id === rec.id) this.writeCache({ ...current, token: '', expiresAt: 0 });
          this.setStatus({ state: 'signed-out', message: 'Session expired — sign in again to resume syncing.' });
          return;
        }
        if (e instanceof CloudError) {
          // a refusal the client cannot fix by retrying (a rejected save shape)
          this.setStatus({ state: 'error', message: e.message });
          return;
        }
        this.scheduleRetry();
        this.setStatus({ state: 'offline', message: 'Offline — progress is saved on this device and will sync automatically.' });
        return;
      }
    }
    // repeated conflicts: another device is actively writing. Back off rather
    // than hammer; the queued edits are still safe in the cache.
    this.scheduleRetry();
    this.setStatus({ state: 'pending', message: 'This pilot is being played elsewhere — syncing shortly.' });
  }

  private scheduleRetry(): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 60_000);
    this.pushTimer = setTimeout(() => { this.pushTimer = null; void this.flush(); }, delay);
  }

  /** Last-gasp push as the page goes away. keepalive lets the request outlive
   *  the document; a normal fetch would be cancelled mid-flight. */
  private flushBeacon(): void {
    const rec = this.live();
    if (!rec?.token || !rec.dirty) return;
    void this.cloud.pushProgress(rec.token, rec.rev, rec.progress, this.deviceId(), true)
      .then(({ rev, sessionExpiresAt }) => {
        const after = this.live();
        if (after && after.id === rec.id && JSON.stringify(after.progress) === JSON.stringify(rec.progress)) {
          this.writeCache({ ...after, rev, dirty: false, expiresAt: sessionExpiresAt ?? after.expiresAt, lastSyncedAt: Date.now() });
        }
      })
      .catch(() => { /* the edits stay queued for the next load */ });
  }

  /** Pull anything another device wrote. No-op while this device has unsynced
   *  edits (flush handles that case, merge and all). */
  async refresh(): Promise<void> {
    const rec = this.live();
    if (!rec?.token) return;
    if (rec.dirty) { void this.flush(); return; }
    if (Date.now() - this.lastRefresh < REFRESH_MIN_GAP_MS) return;
    this.lastRefresh = Date.now();
    try {
      const remote = await this.cloud.pullProgress(rec.token);
      const current = this.live();
      if (!current || current.dirty || current.token !== rec.token || current.id !== rec.id) return; // an edit beat us here
      if (this.adoptRemote(current, remote)) this.notifyProgress();
      this.setStatus({ state: 'clean', lastSyncedAt: Date.now() });
    } catch (e) {
      if (e instanceof CloudError && e.status === 401) {
        const current = this.live();
        if (current && current.id === rec.id) this.writeCache({ ...current, token: '', expiresAt: 0 });
        this.setStatus({ state: 'signed-out', message: 'Session expired — sign in again.' });
        return;
      }
      this.setStatus({ state: 'offline' });
    }
  }

  /** Fetch the registry copy and adopt it (used right after sign-in). */
  private async syncNow(rec: CacheRecord): Promise<void> {
    if (rec.dirty) { await this.flush(); return; }
    const remote = await this.cloud.pullProgress(rec.token, RESUME_TIMEOUT_MS);
    const current = this.live();
    if (!current || current.dirty || current.id !== rec.id) return;
    this.adoptRemote(current, remote);
    this.lastRefresh = Date.now();
    this.setStatus({ state: 'clean', lastSyncedAt: Date.now() });
  }

  /**
   * Take a pulled copy — but ONLY if it is strictly newer than what this device
   * holds. Revisions are monotonic per account (the service increments by one
   * on every accepted write), so `remote.rev < current.rev` means the response
   * is older than the cache: a pull issued before a push that has since landed.
   * Adopting that would roll the player back to a pre-mission save AND drop the
   * at-most-once grant anchors the replayed mission would then re-award.
   * @returns whether the stored progress changed
   */
  private adoptRemote(current: CacheRecord, remote: CloudProgress): boolean {
    const expiresAt = remote.sessionExpiresAt ?? current.expiresAt;
    if (remote.rev <= current.rev) {
      // nothing new, but the session may have slid — keep the local expiry current
      if (expiresAt !== current.expiresAt) this.writeCache({ ...current, expiresAt });
      return false;
    }
    this.writeCache({ ...current, rev: remote.rev, progress: remote.progress, expiresAt, lastSyncedAt: Date.now() });
    return true;
  }

  // ---------- migration off the old per-browser profiles ----------

  /** Callsigns still sitting in this browser's pre-cloud profile store. */
  legacyProfiles(): string[] {
    try {
      const map = JSON.parse(localStorage.getItem(LEGACY) ?? '{}') as Record<string, LegacyProfile>;
      return Object.values(map).map((p) => p.callsign).sort();
    } catch {
      return [];
    }
  }

  /**
   * Move a browser-local pilot into the registry: verify the passcode against
   * the old local hash, claim the callsign (or sign in if it is already
   * claimed with the same passcode), then merge the local save up.
   *
   * The local copy is never deleted — if anything goes wrong the pilot is still
   * exactly where it was.
   */
  async migrateLegacy(callsign: string, passcode: string): Promise<Profile> {
    let map: Record<string, LegacyProfile> = {};
    try {
      map = JSON.parse(localStorage.getItem(LEGACY) ?? '{}') as Record<string, LegacyProfile>;
    } catch { /* handled by the miss below */ }
    const local = map[String(callsign).toLowerCase()];
    if (!local) throw new Error('No local pilot by that callsign.');
    if (local.passHash !== await legacyHash(local.salt, passcode)) throw new Error('Wrong passcode');

    const device = this.deviceId();
    let session: CloudSession;
    try {
      session = await this.cloud.register(local.callsign, passcode, device);
    } catch (e) {
      // callsign already claimed — the same passcode makes it the same pilot,
      // so sign in and merge instead of failing the migration
      if (e instanceof CloudError && e.status === 409) {
        session = await this.cloud.login(local.callsign, passcode, device);
      } else {
        throw rethrow(e);
      }
    }
    await this.adopt(session, passcode);
    const merged = mergeProgress(local.progress, session.progress);
    this.updateProgress(this.current(), (g) => Object.assign(g, merged));
    await this.flush();
    // keep the local copy, but stop offering it
    try {
      const done = new Set((localStorage.getItem(`${LEGACY}.migrated`) ?? '').split(',').filter(Boolean));
      done.add(local.callsign.toLowerCase());
      localStorage.setItem(`${LEGACY}.migrated`, [...done].join(','));
      localStorage.removeItem(LEGACY_SESSION);
    } catch { /* cosmetic only */ }
    return this.current()!;
  }

  /** Legacy pilots that have not been moved up yet. */
  pendingMigrations(): string[] {
    const done = new Set((localStorage.getItem(`${LEGACY}.migrated`) ?? '').split(',').filter(Boolean));
    return this.legacyProfiles().filter((cs) => !done.has(cs.toLowerCase()));
  }
}

/** Registry errors carry player-facing copy already; anything else gets a
 *  sentence that says what the player can do about it. */
function rethrow(e: unknown): never {
  if (e instanceof CloudError) throw new Error(e.message);
  if (e instanceof OfflineError) throw new Error('Cannot reach the pilot registry. Check your connection and try again.');
  throw e instanceof Error ? e : new Error(String(e));
}
