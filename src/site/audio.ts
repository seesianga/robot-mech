/**
 * Landing-page audio: the game's own title theme plus a small set of UI cues.
 *
 * Two different jobs, two different mechanisms:
 *  - Music is a 3.6 MB stream, so it rides an <audio> element and is only
 *    fetched once the visitor has actually asked for sound. Decoding it into an
 *    AudioBuffer up front would stall the main thread for no reason.
 *  - UI cues are tens of kilobytes and must fire with no latency, so they are
 *    decoded into WebAudio buffers and played through a gain node.
 *
 * Autoplay policy is treated as a design constraint, not an obstacle to route
 * around. Nothing makes noise until a real gesture, the control is visible from
 * first paint so sound is never a surprise, and the choice is remembered.
 */

const MUSIC_SRC = 'audio/music/theme_main.mp3';
const STORE_KEY = 'veyra.site.sound';

/** Cue id -> file, relative to the site root. */
const CUES: Record<string, string> = {
  hover: 'audio/site/ui_hover.mp3',
  select: 'audio/site/ui_select.mp3',
  open: 'audio/site/ui_panel.mp3',
  launch: 'audio/site/ui_launch.mp3',
};

export class SiteAudio {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pending = new Set<string>();
  /** Cues known to be unavailable. Without this, a missing file is re-fetched
   *  on every hover for the lifetime of the page. */
  private readonly dead = new Set<string>();
  private music: HTMLAudioElement | null = null;
  private musicTarget = 0.42;
  private enabled = false;
  private listeners: Array<(on: boolean) => void> = [];

  /** Whether the visitor previously opted in. Read once, at construction. */
  readonly remembered: boolean;

  constructor() {
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORE_KEY); } catch { /* private mode */ }
    this.remembered = stored === 'on';
  }

  get on(): boolean {
    return this.enabled;
  }

  onChange(fn: (on: boolean) => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.enabled);
  }

  /**
   * Bring audio up. Must be called from inside a user gesture — every browser
   * will otherwise leave the AudioContext suspended and the <audio> play()
   * promise will reject.
   */
  async enable(): Promise<void> {
    if (this.enabled) return;
    this.enabled = true;
    try { localStorage.setItem(STORE_KEY, 'on'); } catch { /* ignore */ }
    // Repaint the control NOW, not after the 3.6 MB music stream has buffered.
    // The toggle reflects the visitor's intent; on a slow connection, waiting
    // for play() to resolve leaves it looking like a dead button.
    this.emit();

    if (!this.ctx) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        this.ctx = new Ctor();
        this.bus = this.ctx.createGain();
        this.bus.gain.value = 0.5;
        this.bus.connect(this.ctx.destination);
      }
    }
    if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => {});

    if (!this.music) {
      this.music = new Audio(MUSIC_SRC);
      this.music.loop = true;
      this.music.preload = 'auto';
      this.music.volume = 0;
    }
    await this.music.play().catch(() => { /* still blocked; the toggle stays available */ });
    this.ramp(this.musicTarget, 1400);

    // Warm every cue now rather than on first use. They total well under 100 KB,
    // and a cue fetched at the moment it is needed arrives too late to be heard —
    // most visibly the launch cue, which the Play button only holds navigation
    // open for ~340 ms. Fetching at enable() means sound was explicitly asked
    // for, so this is never speculative traffic.
    for (const id of Object.keys(CUES)) void this.buffer(id);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    try { localStorage.setItem(STORE_KEY, 'off'); } catch { /* ignore */ }
    this.ramp(0, 500, () => this.music?.pause());
    this.emit();
  }

  toggle(): void {
    if (this.enabled) this.disable(); else void this.enable();
  }

  /** Linear fade on the music element — abrupt cuts sound broken. */
  private ramp(to: number, ms: number, done?: () => void): void {
    const el = this.music;
    if (!el) { done?.(); return; }
    const from = el.volume;
    const t0 = performance.now();
    const step = (): void => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.volume = from + (to - from) * k;
      if (k < 1) requestAnimationFrame(step); else done?.();
    };
    requestAnimationFrame(step);
  }

  /** Fetch + decode a cue on demand; repeated calls for the same id are free. */
  private async buffer(id: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(id)) return this.buffers.get(id)!;
    if (this.dead.has(id) || !this.ctx || this.pending.has(id)) return null;
    const src = CUES[id];
    if (!src) return null;
    this.pending.add(id);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(id, buf);
      return buf;
    } catch {
      // A missing cue must never break interaction — the click still works, it
      // is just silent. Remember the failure so it is not retried forever.
      this.dead.add(id);
      return null;
    } finally {
      this.pending.delete(id);
    }
  }

  /** Fire a UI cue. Silent no-op when sound is off or the cue is unavailable. */
  play(id: string, gain = 1): void {
    if (!this.enabled || !this.ctx || !this.bus) return;
    void this.buffer(id).then((buf) => {
      if (!buf || !this.ctx || !this.bus || !this.enabled) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.bus);
      src.start();
    });
  }

  /**
   * Duck the music under a moment that needs the room — used when the hero
   * voice line plays. Returns a function that restores the previous level.
   */
  duck(to = 0.12, ms = 400): () => void {
    const prev = this.musicTarget;
    this.ramp(to, ms);
    return () => { this.musicTarget = prev; this.ramp(prev, 900); };
  }

  /** Play a one-shot voice line over the music, ducking underneath it. */
  async speak(src: string): Promise<void> {
    if (!this.enabled) return;
    const restore = this.duck();
    const el = new Audio(src);
    el.volume = 0.92;
    await el.play().catch(() => {});
    el.addEventListener('ended', restore, { once: true });
    el.addEventListener('error', restore, { once: true });
  }
}
