import './site.css';
import { SiteAudio } from './audio';
import type { MechStage } from './stage';

/**
 * NOTE ON THE 3D IMPORT — `./stage` is loaded with a dynamic import, never a
 * static one, and that is load-bearing rather than stylistic.
 *
 * A static import puts Three.js, GLTFLoader and the meshopt decoder into this
 * page's initial module graph: measured at 765 KB raw / 172 KB gzipped, fetched
 * and parsed before first paint, on every visit, including phones that will
 * never start a WebGL context and visitors who bounce off the hero. The stage is
 * the last thing on the page that matters and the first thing to give up, so it
 * is fetched only when the showroom is within 300 px of the viewport and only on
 * a device that can actually use it.
 */

/**
 * Landing-page behaviour.
 *
 * Everything here is progressive enhancement over markup that already works:
 * the roster is real HTML generated at build time by scripts/vite-site-truth.mjs,
 * the gallery is plain links to full-resolution files, and the FAQ is <details>.
 * With this script blocked the page loses the live 3D stage, the reveals and the
 * sound — and stays completely usable.
 */

/**
 * Proof that this module actually ran — not merely that scripting is enabled.
 * `[data-reveal]` elements only become hidden once this class is present, so a
 * bundle that 404s or fails to parse leaves the page fully visible instead of
 * blank. Set first, before anything that could throw. See site.css.
 */
document.documentElement.classList.add('js-ready');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const audio = new SiteAudio();

// ---------------------------------------------------------------- boot cover

(() => {
  const boot = document.getElementById('boot');
  const bar = document.getElementById('boot-bar');
  const line = document.getElementById('boot-line');
  if (!boot) return;

  const steps = ['Actuator lattice', 'Weapon buses', 'Coolant loop', 'All boards ready'];
  let i = 0;
  const tick = window.setInterval(() => {
    i = Math.min(i + 1, steps.length);
    if (bar) bar.style.setProperty('--p', `${(i / steps.length) * 100}%`);
    if (line && i < steps.length) line.textContent = steps[i];
  }, 220);

  const done = (): void => {
    window.clearInterval(tick);
    if (bar) bar.style.setProperty('--p', '100%');
    boot.classList.add('is-done');
    // Nothing below the cover should be reachable while it is up, and nothing
    // above it should be reachable once it is gone.
    window.setTimeout(() => boot.remove(), 700);
  };

  if (document.readyState === 'complete') window.setTimeout(done, 300);
  else window.addEventListener('load', () => window.setTimeout(done, 300), { once: true });

  // Failsafe. A preloader that can strand the page on a slow or partly-failed
  // load is strictly worse than no preloader at all.
  window.setTimeout(done, 4000);
})();

// ---------------------------------------------------------------- header

(() => {
  const hdr = document.getElementById('hdr');
  const nav = document.getElementById('nav');
  const burger = document.getElementById('burger');
  if (!hdr) return;

  const onScroll = (): void => { hdr.classList.toggle('is-stuck', window.scrollY > 24); };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const setMenu = (open: boolean): void => {
    nav?.classList.toggle('is-open', open);
    burger?.classList.toggle('is-open', open);
    burger?.setAttribute('aria-expanded', String(open));
    // The nav sits BEFORE the burger in the DOM, so an opened menu puts its
    // links behind the trigger in focus order — tabbing forward from the burger
    // skips straight past the menu it just opened. Moving focus to the first
    // link on open, and back to the burger on close, is the standard fix and
    // makes the control keyboard-usable at all.
    if (open) nav?.querySelector('a')?.focus();
    else if (document.activeElement && nav?.contains(document.activeElement)) burger?.focus();
  };

  burger?.addEventListener('click', () => {
    setMenu(!(nav?.classList.contains('is-open') ?? false));
  });

  // Escape closes it, as every disclosure widget is expected to.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav?.classList.contains('is-open')) setMenu(false);
  });
  nav?.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => setMenu(false));
  });
})();

// ---------------------------------------------------------------- reveals

(() => {
  const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);   // reveal once; re-animating on scroll-back is noise
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach((el) => io.observe(el));
})();

// ---------------------------------------------------------------- counters

(() => {
  const cells = document.querySelectorAll<HTMLElement>('[data-count]');
  if (!cells.length) return;
  if (reduceMotion || !('IntersectionObserver' in window)) return; // markup already holds the value

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      io.unobserve(el);
      const target = Number(el.dataset.count ?? '0');
      if (!Number.isFinite(target) || target <= 0) continue;
      const t0 = performance.now();
      const dur = 900;
      const step = (): void => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        // Ease-out so it decelerates into the real number rather than snapping.
        el.textContent = String(Math.round(target * (1 - (1 - k) ** 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.5 });
  cells.forEach((el) => io.observe(el));
})();

// ---------------------------------------------------------------- hero parallax

(() => {
  const plate = document.querySelector<HTMLElement>('.hero__plate');
  const hero = document.querySelector<HTMLElement>('.hero');
  if (!plate || !hero || reduceMotion) return;

  let ticking = false;
  const update = (): void => {
    ticking = false;
    const y = window.scrollY;
    if (y > hero.offsetHeight) return;      // stop doing work once it is off-screen
    plate.style.setProperty('--plate-y', `${y * 0.16}px`);
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
})();

// ---------------------------------------------------------------- audio

(() => {
  const btn = document.getElementById('sound');
  const label = document.getElementById('sound-label');
  if (!btn) return;

  const paint = (on: boolean): void => {
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
    if (label) label.textContent = on ? 'Sound on' : 'Sound';
  };
  audio.onChange(paint);
  btn.addEventListener('click', () => audio.toggle());

  // A previous opt-in is honoured, but still only on the next real gesture —
  // localStorage is not consent to make noise before the visitor touches
  // anything, and browsers would block it anyway.
  if (audio.remembered) {
    const arm = (): void => void audio.enable();
    window.addEventListener('pointerdown', arm, { once: true });
    window.addEventListener('keydown', arm, { once: true });
  }

  // Cues are opt-in per element via data-cue, so nothing makes a sound by
  // accident and the set stays auditable from the markup.
  let lastHover = 0;
  document.querySelectorAll<HTMLElement>('[data-cue]').forEach((el) => {
    // Anchors that navigate need the cue to finish before the document is torn
    // down — a launch sound cut off after 30 ms is just a click. Hold the
    // navigation briefly, but ONLY when the visitor has asked for sound, and
    // never for a modified click (those open a new tab and must not be
    // intercepted). The timer navigates unconditionally, so the worst case for
    // the page's most important link is a 340 ms delay, not a dead button.
    const href = el.getAttribute('href');
    if (el.tagName === 'A' && href) {
      el.addEventListener('click', (ev) => {
        const e = ev as MouseEvent;
        if (!audio.on || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        audio.play(el.dataset.cue!, 0.8);
        window.setTimeout(() => { window.location.href = href; }, 340);
      });
      return;
    }
    el.addEventListener('click', () => audio.play(el.dataset.cue!, 0.7));
  });
  document.querySelectorAll<HTMLElement>('.chassis__item, .btn, .filter').forEach((el) => {
    el.addEventListener('pointerenter', () => {
      const now = performance.now();
      if (now - lastHover < 120) return;    // rate-limit; a hover tick per pixel is torture
      lastHover = now;
      audio.play('hover', 0.5);
    });
  });

  // The litany is the game's actual shipped file, not a re-recording.
  document.getElementById('litany-play')?.addEventListener('click', async () => {
    if (!audio.on) await audio.enable();
    const items = document.querySelectorAll<HTMLElement>('#litany li');
    items.forEach((li, i) => {
      li.classList.remove('is-lit');
      window.setTimeout(() => li.classList.add('is-lit'), 300 + i * 1600);
    });
    void audio.speak('audio/vo/cairn_litany.mp3');
  });
})();

// ---------------------------------------------------------------- showroom

(() => {
  const host = document.getElementById('show-stage');
  const canvas = document.getElementById('show-canvas') as HTMLCanvasElement | null;
  const list = document.getElementById('chassis');
  if (!host || !canvas || !list) return;

  const tiles = [...list.querySelectorAll<HTMLElement>('.chassis__item')];
  if (!tiles.length) return;

  const el = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
  const specName = el('spec-name');
  const specClass = el('spec-class');
  const specRole = el('spec-role');
  const specTons = el('spec-tons');
  const specSpeed = el('spec-speed');
  const specTwist = el('spec-twist');
  const specHeat = el('spec-heat');
  const specJets = el('spec-jets');
  const specHp = el('spec-hp');
  const specBar = el('spec-bar');
  const specLoad = el('spec-loadout');
  const status = el('roster-status');

  const HP_LABEL: Record<string, string> = {
    energy: 'E', ballistic: 'B', missile: 'M', utility: 'U',
  };

  /** Paint the spec panel from a tile's dataset — the only source of truth. */
  function paint(tile: HTMLElement): void {
    const d = tile.dataset;
    if (specName) specName.textContent = d.name ?? '';
    if (specClass) specClass.textContent = d.class ?? '';
    // role is stored as "Recon; reverse-joint legs, antler sensor mast" —
    // the clause before the semicolon is the role, the rest is flavour.
    if (specRole) specRole.textContent = (d.role ?? '').replace(/;\s*/, ' — ');
    if (specTons) specTons.textContent = `${d.tons} t`;
    if (specSpeed) specSpeed.textContent = `${d.speed} km/h`;
    if (specTwist) specTwist.textContent = `${d.twist}°`;
    if (specHeat) specHeat.textContent = d.heat ?? '';
    if (specJets) specJets.textContent = d.jets === 'yes' ? 'Yes' : 'None';
    if (specLoad) specLoad.textContent = d.loadout ?? '';
    if (specBar) specBar.style.setProperty('--w', `${d.pct ?? 0}%`);
    if (specHp) {
      specHp.innerHTML = '';
      // The chips read as bare letters ("E E U") to a screen reader, which is
      // meaningless without the visual key beside them. Each carries its own
      // label; the letter itself is decorative.
      const counts: Record<string, number> = {};
      for (const h of (d.hp ?? '').split(',').filter(Boolean)) {
        counts[h] = (counts[h] ?? 0) + 1;
        const i = document.createElement('i');
        i.className = `hp hp--${h}`;
        i.setAttribute('role', 'listitem');
        i.setAttribute('aria-label', `${h[0].toUpperCase()}${h.slice(1)} hardpoint`);
        i.title = `${h[0].toUpperCase()}${h.slice(1)} hardpoint`;
        const glyph = document.createElement('span');
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = HP_LABEL[h] ?? '?';
        i.appendChild(glyph);
        specHp.appendChild(i);
      }
    }
  }

  paint(tiles[0]);

  // The stage is built lazily: constructing a WebGL context, a PMREM
  // environment and a bloom composer for a section the visitor may never scroll
  // to is exactly the kind of cost that makes a heavy page.
  let stage: MechStage | null = null;
  let starting = false;
  let pending = tiles[0].dataset.mech!;

  /**
   * Cheap local capability test, deliberately duplicated from the stage module
   * so an unsupported device never downloads the module to find out it cannot
   * use it.
   */
  function canRunStage(): boolean {
    // Note: prefers-reduced-motion does NOT disqualify the stage. It switches it
    // to staticMode — no turntable, no parallax, render on demand. Refusing to
    // start it left every one of the twelve chassis showing the same Gabbro
    // still, which is worse for that visitor than no showroom at all.
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  async function ensureStage(): Promise<void> {
    if (stage || starting || !canvas || !host) return;
    if (!canRunStage()) { host.classList.add('is-fallback'); return; }
    starting = true;
    host.classList.add('is-loading');
    try {
      const { MechStage: Stage, suggestedQuality } = await import('./stage');
      stage = new Stage({
        canvas,
        initial: pending,
        quality: suggestedQuality(),
        lod: 'lod0',
        // 0.82 puts the machine at roughly 76% of the viewport height — big
        // enough to read the hardpoints, with headroom for the sensor masts on
        // the Flint and the Corundum, which are the tallest silhouettes.
        distance: 0.82,
        staticMode: reduceMotion,
        onLoaded: (id, ok) => {
          host.classList.remove('is-loading');
          if (ok) host.dataset.loadedMech = id;
          else delete host.dataset.loadedMech;
          // Toggle, never latch. A single missing GLB used to pin the fallback
          // still on for the rest of the session, so every later chassis showed
          // the wrong machine.
          host.classList.toggle('is-fallback', !ok);
        },
      });
      // If the frame-budget guard runs out of levers it stops drawing; the still
      // underneath has to become visible at that moment, not stay behind a blank
      // canvas.
      stage.onQualityDrop((step, reason) => {
        console.info(`[stage] ${reason}`);
        if (step >= 4) host.classList.add('is-fallback');
      });
      stage.observe();
    } catch (e) {
      // A failed chunk fetch must degrade to the still, not to a broken section.
      console.warn('[stage] unavailable', e);
      host.classList.remove('is-loading');
      host.classList.add('is-fallback');
    } finally {
      starting = false;
    }
  }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      void ensureStage();
    }, { rootMargin: '300px' });
    io.observe(host);
  } else {
    void ensureStage();
  }

  function select(tile: HTMLElement): void {
    for (const t of tiles) {
      const on = t === tile;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-pressed', String(on));
    }
    paint(tile);
    pending = tile.dataset.mech!;
    audio.play('select', 0.8);
    if (stage) {
      host!.classList.add('is-loading');
      delete host!.dataset.loadedMech;
      void stage.show(pending);
    } else {
      void ensureStage();
    }
    // The weight settle: the panel dips under the tonnage of what was just
    // loaded and comes back up. Heavier machine, deeper dip. It is the one
    // gesture on the page that says "this thing has mass" without a word.
    // The animation is defined on .showroom__view — the bordered viewport — not
    // on the .stage element inside it. Applying it to `host` meant the settle
    // silently never ran.
    const viewport = host!.closest('.showroom__view') as HTMLElement | null;
    if (!reduceMotion && viewport) {
      const pct = Number(tile.dataset.pct ?? '50');
      viewport.style.setProperty('--settle', `${2 + (pct / 100) * 5}px`);
      viewport.classList.remove('is-settling');
      void viewport.offsetWidth;                    // restart the animation
      viewport.classList.add('is-settling');
    }
  }

  for (const tile of tiles) {
    tile.addEventListener('click', () => select(tile));
  }

  // Arrow keys walk the rail, which is what a tablist is expected to do.
  list.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp'
      && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const visible = tiles.filter((t) => !t.hidden);
    const cur = visible.findIndex((t) => t.classList.contains('is-on'));
    const dir = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
    const next = visible[(cur + dir + visible.length) % visible.length];
    if (!next) return;
    e.preventDefault();
    next.focus();
    select(next);
  });

  // --- weight-class filter ---
  const filters = [...document.querySelectorAll<HTMLElement>('.filter')];
  for (const btn of filters) {
    btn.addEventListener('click', () => {
      const want = btn.dataset.filter ?? 'all';
      for (const b of filters) {
        const on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      }
      for (const t of tiles) t.hidden = want !== 'all' && t.dataset.class !== want;
      const shown = tiles.filter((t) => !t.hidden);
      // Announce the result: silently removing nine of twelve machines from the
      // rail is a large change that a screen-reader user would otherwise have to
      // discover by exploring.
      if (status) {
        status.textContent = want === 'all'
          ? `Showing all ${shown.length} chassis`
          : `Showing ${shown.length} ${want} chassis`;
      }
      // Never leave the viewport showing a machine the filter just hid.
      if (shown.length && !shown.some((t) => t.classList.contains('is-on'))) select(shown[0]);
    });
  }
})();
