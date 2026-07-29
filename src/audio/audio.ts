import manifestJson from '../../content/audio-manifest.json';

interface PlayOpts {
  bus?: 'music' | 'sfx' | 'vo' | 'ui';
  loop?: boolean;
  volume?: number;
  futz?: boolean;
  rate?: number;
}

interface LoopHandle {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Web Audio manager. Tolerates missing files (pre-generation the game runs
 * silent with subtitles). Radio futz chain per the audio bible:
 * HP 250 Hz → LP 3.2 kHz → soft waveshaper → 4:1 compression → squelch clicks.
 * CAIRN never goes through the futz — she is in the cockpit with you.
 */
export class AudioMan {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer | null>();
  private master!: GainNode;
  private buses!: Record<'music' | 'sfx' | 'vo' | 'ui', GainNode>;
  private futzChain!: { input: AudioNode };
  private manifest: Record<string, string> = (manifestJson as { entries: Record<string, string> }).entries;
  private voPlaying = 0;
  private musicLayers: { ambient?: LoopHandle; combat?: LoopHandle } = {};
  private combatStems: LoopHandle[] = []; // mus_combat_l1..l3 when generated
  private loops = new Map<string, LoopHandle>();
  private cancelledLoops = new Set<string>();
  private combatOn: boolean | null = null;
  private threatLevel = 0;
  private deescalateAt = 0; // earliest ctx.currentTime a lower level may apply
  onSubtitle: ((speaker: string, text: string, seconds: number) => void) | null = null;

  /** Must be called from a user gesture (or test mode). Safe to call again —
   *  a repeat call re-attempts resume, which un-suspends a context that was
   *  created before the browser had a user gesture to honor. */
  init(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    this.buses = {
      music: ctx.createGain(),
      sfx: ctx.createGain(),
      vo: ctx.createGain(),
      ui: ctx.createGain(),
    };
    this.buses.music.gain.value = 0.55;
    this.buses.sfx.gain.value = 0.9;
    this.buses.vo.gain.value = 1.0;
    this.buses.ui.gain.value = 0.7;
    for (const b of Object.values(this.buses)) b.connect(this.master);

    // radio futz chain
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 250;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3200;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 1.8);
    }
    shaper.curve = curve;
    const comp = ctx.createDynamicsCompressor();
    comp.ratio.value = 4; comp.threshold.value = -22; comp.attack.value = 0.004; comp.release.value = 0.12;
    hp.connect(lp); lp.connect(shaper); shaper.connect(comp); comp.connect(this.buses.vo);
    this.futzChain = { input: hp };

    void ctx.resume();
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  private async load(id: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(id)) return this.buffers.get(id) ?? null;
    const path = this.manifest[id];
    if (!path || !this.ctx) {
      this.buffers.set(id, null);
      return null;
    }
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(String(res.status));
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(id, buf);
      return buf;
    } catch {
      console.warn(`[audio] missing: ${id} (${path}) — running silent`);
      this.buffers.set(id, null);
      return null;
    }
  }

  preload(ids: string[]): void {
    for (const id of ids) void this.load(id);
  }

  private squelch(when: number): void {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * 0.03);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.4;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.buses.vo);
    src.start(when);
  }

  async play(id: string, opts: PlayOpts = {}): Promise<number> {
    if (!this.ctx) return 0;
    const buf = await this.load(id);
    if (!buf) return 0;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!opts.loop;
    if (opts.rate) src.playbackRate.value = opts.rate;
    const gain = this.ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    src.connect(gain);
    if (opts.futz) gain.connect(this.futzChain.input);
    else gain.connect(this.buses[opts.bus ?? 'sfx']);
    src.start();
    if (opts.loop) {
      // stopLoop() may have raced us during the async decode
      if (this.cancelledLoops.has(id)) {
        this.cancelledLoops.delete(id);
        try { src.stop(); } catch { /* fine */ }
      } else {
        this.loops.set(id, { source: src, gain });
      }
    }
    return buf.duration;
  }

  stopLoop(id: string): void {
    const h = this.loops.get(id);
    if (h) {
      try { h.source.stop(); } catch { /* already stopped */ }
      this.loops.delete(id);
    } else {
      // not registered yet — flag so a mid-flight play() cancels itself
      this.cancelledLoops.add(id);
    }
  }

  /**
   * PATHLIGHT audio-navigation assist: one spatialized ping at the
   * destination's relative bearing (HRTF panner — the route must be
   * completable with the screen ignored). Prefers the pre-baked `ui.nav.ping`
   * asset; falls back to a small synthesized ping so the assist still works
   * before the asset batch is generated. Rides the UI bus, so it ducks under
   * nothing louder than the rest of the UI — losing your way is never louder
   * than losing your reactor.
   * @param bearingRel relative bearing, radians, positive = pilot's LEFT
   * @param rate pitch multiplier (rises ~2 semitones inside the last 30 m)
   */
  async playNavPing(volume: number, rate: number, bearingRel: number): Promise<void> {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const pan = ctx.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'linear';
    pan.refDistance = 8;
    // listener looks down −Z; +bearing = pilot's LEFT = −X
    const d = 8;
    pan.positionX.value = -Math.sin(bearingRel) * d;
    pan.positionY.value = 0;
    pan.positionZ.value = -Math.cos(bearingRel) * d;
    pan.connect(this.buses.ui);
    const buf = await this.load('ui.nav.ping');
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(pan);
      src.start();
      return;
    }
    // synth fallback: 90 ms sine blip with a fast decay
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 960 * rate;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume * 0.5, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(gain);
    gain.connect(pan);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  private briefingSrc: AudioBufferSourceNode | null = null;

  /** Pre-mission radio briefing — stoppable so LAUNCH can cut it clean. */
  async playBriefing(id: string): Promise<number> {
    if (!this.ctx) return 0;
    const buf = await this.load(id);
    if (!buf || !this.ctx) return 0;
    this.stopBriefing();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = 1;
    src.connect(gain);
    gain.connect(this.futzChain.input);
    this.squelch(this.ctx.currentTime);
    src.start();
    this.briefingSrc = src;
    return buf.duration;
  }

  stopBriefing(): void {
    try { this.briefingSrc?.stop(); } catch { /* already stopped */ }
    this.briefingSrc = null;
  }

  /** VO with subtitle + music duck. Estimates duration from text if no file. */
  async playVO(id: string, speaker: string, text: string, futz: boolean): Promise<void> {
    const est = Math.max(2, text.split(/\s+/).length / 2.6);
    this.onSubtitle?.(speaker, text, est + 0.8);
    if (!this.ctx) return;

    this.voPlaying++;
    this.duckMusic(true);
    if (futz) this.squelch(this.ctx.currentTime);
    const dur = await this.play(id, { bus: 'vo', futz });
    const wait = (dur || est) * 1000;
    if (futz && dur) this.squelch(this.ctx.currentTime + dur);
    setTimeout(() => {
      this.voPlaying--;
      if (this.voPlaying <= 0) this.duckMusic(false);
    }, wait);
  }

  private ramp(param: AudioParam, target: number, seconds: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(target, t + seconds);
  }

  private duckMusic(on: boolean): void {
    this.ramp(this.buses.music.gain, 0.55 * (on ? 0.5 : 1), 0.3);
  }

  private async startLayer(id: string, vol: number): Promise<LoopHandle | undefined> {
    const buf = await this.load(id);
    if (!buf || !this.ctx) return undefined;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(this.buses.music);
    src.start();
    return { source: src, gain };
  }

  /**
   * Adaptive score per the audio bible §6: per-biome ambient bed + the three
   * vertical combat stems (mus_combat_l1..l3). Duel missions pass a `suite` —
   * the exclusive scripted cue loops alone and the vertical system stays off.
   * Falls back to the legacy two-track pair when the generated cues are absent.
   */
  async startMusic(opts: { biome?: string; suite?: string } = {}): Promise<void> {
    if (!this.ctx) return;
    this.threatLevel = 0;
    this.combatOn = null;
    if (opts.suite) {
      this.musicLayers.ambient = await this.startLayer(`music.${opts.suite}`, 1);
      if (this.musicLayers.ambient) return; // exclusive: no vertical layers
    }
    const bedId = opts.biome && this.manifest[`music.mus_biome_${opts.biome}`]
      ? `music.mus_biome_${opts.biome}` : 'music.ambient_coast';
    this.musicLayers.ambient = await this.startLayer(bedId, 1);
    if (this.manifest['music.mus_combat_l1']) {
      this.combatStems = (await Promise.all(
        ['music.mus_combat_l1', 'music.mus_combat_l2', 'music.mus_combat_l3']
          .map((id) => this.startLayer(id, 0)),
      )).filter((h): h is LoopHandle => !!h);
    }
    if (this.combatStems.length === 0) this.musicLayers.combat = await this.startLayer('music.combat1', 0);
  }

  /**
   * Vertical layering (bible §6.4). Threat level 0 calm / 1 alert / 2 engaged /
   * 3 overwhelmed; booleans map to 0/2 for legacy call sites. Escalation is
   * immediate; de-escalation holds ~8 s (≈4 bars at 112 BPM) so the score
   * never flutters between states.
   */
  setCombat(state: boolean | number): void {
    if (!this.ctx) return;
    const level = typeof state === 'boolean' ? (state ? 2 : 0) : Math.max(0, Math.min(3, state));
    if (level > this.threatLevel) {
      this.threatLevel = level;
      this.applyThreat(1.2);
    } else if (level < this.threatLevel) {
      const t = this.ctx.currentTime;
      if (this.deescalateAt === 0) this.deescalateAt = t + 8;
      else if (t >= this.deescalateAt) {
        this.threatLevel = level;
        this.deescalateAt = 0;
        this.applyThreat(4);
      }
      return;
    }
    this.deescalateAt = 0;
  }

  private applyThreat(seconds: number): void {
    const lvl = this.threatLevel;
    if (this.combatStems.length) {
      this.combatStems.forEach((h, i) => this.ramp(h.gain.gain, lvl >= i + 1 ? 1 : 0, seconds));
      if (this.musicLayers.ambient) {
        this.ramp(this.musicLayers.ambient.gain.gain, lvl === 0 ? 1 : lvl === 1 ? 0.6 : 0.35, seconds);
      }
      return;
    }
    // legacy two-track fallback: binary at engaged+
    const on = lvl >= 2;
    if (this.combatOn === on) return;
    this.combatOn = on;
    if (this.musicLayers.combat) this.ramp(this.musicLayers.combat.gain.gain, on ? 1 : 0, 2);
    if (this.musicLayers.ambient) this.ramp(this.musicLayers.ambient.gain.gain, on ? 0.35 : 1, 2);
  }

  /** Stingers preempt (bible §6.5): combat layers hard-mute, ambient eases off. */
  stingerPreempt(): void {
    this.threatLevel = 0;
    this.deescalateAt = 0;
    this.combatOn = false;
    for (const h of this.combatStems) this.ramp(h.gain.gain, 0, 0.05);
    if (this.musicLayers.combat) this.ramp(this.musicLayers.combat.gain.gain, 0, 0.05);
    if (this.musicLayers.ambient) this.ramp(this.musicLayers.ambient.gain.gain, 0, 2);
  }

  /** Bring the ambient bed back after a mid-mission scripted sting. */
  resumeBed(): void {
    if (!this.musicLayers.ambient) return;
    const lvl = this.threatLevel;
    this.ramp(this.musicLayers.ambient.gain.gain, lvl === 0 ? 1 : lvl === 1 ? 0.6 : 0.35, 3);
  }

  /** Play the first cue of `ids` that has a file; returns its duration. */
  async playFirst(ids: string[], opts: PlayOpts = {}): Promise<number> {
    for (const id of ids) {
      const dur = await this.play(id, opts);
      if (dur > 0) return dur;
    }
    return 0;
  }

  stopMusic(): void {
    for (const h of [this.musicLayers.ambient, this.musicLayers.combat, ...this.combatStems]) {
      try { h?.source.stop(); } catch { /* fine */ }
    }
    this.musicLayers = {};
    this.combatStems = [];
  }
}
