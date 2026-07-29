/**
 * "Compact Net Control" — the multiplayer announcer bus.
 * One global voice with per-category cooldowns (4 s) so simultaneous events
 * queue instead of overlapping; the queue is short and drops the stalest
 * entry rather than backing up. BATCOM safety callouts bypass this bus
 * entirely (they play immediately on the local channel).
 */

interface Pending {
  id: string;
  category: string;
  text: string;
}

const CATEGORY_COOLDOWN = 4;
const MAX_QUEUE = 3;

export class Announcer {
  private cooldowns = new Map<string, number>();
  private queue: Pending[] = [];
  private counter = 0;

  /** play(fileId, uniqueCueId, text) — wire to the mission's VO path */
  constructor(private play: (fileId: string, cueId: string, text: string) => void) {}

  say(id: string, category: string, text: string): void {
    if ((this.cooldowns.get(category) ?? 0) > 0) {
      if (this.queue.length >= MAX_QUEUE) this.queue.shift();
      this.queue.push({ id, category, text });
      return;
    }
    this.fire(id, category, text);
  }

  update(dt: number): void {
    for (const [k, v] of this.cooldowns) {
      if (v > 0) this.cooldowns.set(k, v - dt);
    }
    const next = this.queue.findIndex((p) => (this.cooldowns.get(p.category) ?? 0) <= 0);
    if (next >= 0) {
      const p = this.queue.splice(next, 1)[0];
      this.fire(p.id, p.category, p.text);
    }
  }

  private fire(id: string, category: string, text: string): void {
    this.cooldowns.set(category, CATEGORY_COOLDOWN);
    this.play(`vo.mp.${id}`, `an_${this.counter++}`, text);
  }
}
