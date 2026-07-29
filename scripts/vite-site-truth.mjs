import fs from 'node:fs';
import path from 'node:path';
import { censusForBuild } from './asset_census.mjs';

/**
 * Vite plugin: every factual number on the landing page is derived from the
 * game's own data at build time, and the build fails if the page contradicts it.
 *
 * The problem this solves is boring and permanent: marketing copy drifts. The
 * previous site claimed "Twelve Original Chassis" in one paragraph while the
 * nav said something else, listed a tutorial as "OP0: Proving Ground" long after
 * it was renamed to Basic Training, and advertised a roster whose stats had been
 * hand-copied out of content/mechs.json months earlier. Nobody notices, and then
 * a player does.
 *
 * So the page contains no hardcoded facts at all. It contains %%FACT:name%%
 * tokens, which are substituted here from content/*.json, src/sim/campaign.ts
 * and the actual contents of public/. Three failure modes are build errors:
 *
 *   1. a token that resolves to nothing (typo, or a fact that stopped existing)
 *   2. a %%FACT:...%% left in the output (unsubstituted)
 *   3. a forbidden claim appearing anywhere in the markup — the specific
 *      overstatements this project is prone to, listed in FORBIDDEN
 *
 * The cost is one file. The benefit is that the site cannot lie about the game
 * again without someone deliberately deleting this plugin.
 */
export function siteTruth({ root, verbose = false } = {}) {
  return {
    name: 'veyra-site-truth',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // Only the marketing page carries claims; the game entry points do not.
        if (!ctx.filename.endsWith('index.html')) return html;

        const facts = { ...deriveFacts(root), ...deriveFragments(root) };
        if (verbose) {
          console.log('\n[site-truth] derived facts:');
          for (const [k, v] of Object.entries(facts)) console.log(`  ${k} = ${v}`);
        }

        const unknown = [];
        let out = html.replace(/%%FACT:([a-zA-Z0-9_]+)%%/g, (_m, key) => {
          if (!(key in facts)) { unknown.push(key); return _m; }
          return String(facts[key]);
        });

        if (unknown.length) {
          throw new Error(
            `[site-truth] index.html references facts that do not exist: `
            + `${[...new Set(unknown)].join(', ')}\n`
            + `  known facts: ${Object.keys(facts).join(', ')}`,
          );
        }
        const leftover = out.match(/%%FACT:[^%]*%%/g);
        if (leftover) {
          throw new Error(`[site-truth] unsubstituted tokens: ${leftover.join(', ')}`);
        }

        for (const { pattern, why } of FORBIDDEN) {
          const hit = out.match(pattern);
          if (hit) {
            throw new Error(
              `[site-truth] forbidden claim in index.html: ${JSON.stringify(hit[0])}\n  ${why}`,
            );
          }
        }

        for (const rule of STRUCTURAL) {
          const problem = rule.check(out);
          if (problem) {
            throw new Error(`[site-truth] ${rule.name}: ${problem}`);
          }
        }

        if (verbose) console.log(`[site-truth] ${FORBIDDEN.length} claim rules and `
          + `${STRUCTURAL.length} structural rules passed\n`);
        return out;
      },
    },
  };
}

/**
 * Claims this project has actually got wrong before, or would if nobody was
 * watching. Each one is a build failure, not a lint warning.
 */
const FORBIDDEN = [
  {
    pattern: /\b(?:14|fourteen)\s+(?:pilotable|playable)\b/i,
    why: 'content/mechs.json defines 12 pilotable chassis. craton-x is the M24 duel '
      + 'boss and gabbro-slagwolf is an enemy variant; neither has a stat row. '
      + 'Say "12 pilotable" and, separately, "14 machines modelled".',
  },
  {
    pattern: /4K\s+(?:textures?|PBR|materials?)|4096\s*(?:px|²|\^2)?\s*textures?/i,
    why: 'Tripo3D authored the source textures at 4096 square, but the shipped LODs '
      + 'are 2048 (lod0), 1024 (lod1) and 512 (lod2). Claiming 4K textures in the '
      + 'browser is false. 4K is true of the key art and the screen captures only.',
  },
  {
    pattern: /four-letter code|4-letter code|private room/i,
    why: 'There is no room-code lobby. Multiplayer is a 30-second quick-match queue '
      + '(src/ui/start.ts): everyone who joins in the same window drops together, five '
      + 'on five, and empty seats are filled by robots. This claim was inherited from '
      + 'an older build and survived a whole site rewrite.',
  },
  {
    pattern: /Team Deathmatch/i,
    why: 'The modes are Deathmatch (5v5, first team to 20 kills) and Capture the Flag '
      + '(flag conversion, target 100) — see src/net/mpmission.ts. There is no separate '
      + 'Team Deathmatch mode; Deathmatch is already team-based.',
  },
  {
    pattern: /loadouts?\s+(?:are\s+)?swappable|swap\s+loadouts?|refit\s+your/i,
    why: 'The refit console is not implemented — src/ui/hangar.ts tells the player '
      + '"every frame runs its stock loadout in this build". Do not promise it.',
  },
  {
    pattern: /one live object per room|a Durable Object per room/i,
    why: 'worker/index.mjs: "one lobby DO carries all rooms". Per-room sharding is the '
      + 'documented scale path, not the current architecture.',
  },
  {
    pattern: /\bOP\s*0\b|Proving Ground/i,
    why: 'The tutorial is "BASIC TRAINING" (src/sim/basictraining.ts and the main '
      + 'menu). "OP0 / Proving Ground" is a stale name from an earlier build.',
  },
];

/**
 * Checks that need to look at structure rather than match a string.
 *
 * A bare regex was tried for the MechWarrior rule and was wrong: it flagged the
 * FAQ question ("Is this a MechWarrior game?") that the disclaimer answers,
 * because the disclaiming words sit in a sibling element. The rule is really
 * about location, so it is expressed as one.
 */
const STRUCTURAL = [
  {
    name: 'mechwarrior-confined-to-disclaimer',
    check(html) {
      const hits = [...html.matchAll(/\bMechWarrior\b/gi)];
      if (!hits.length) return null;
      // Every mention must live inside a <details> that also carries the
      // disclaimer, which is the only context where naming it is honest.
      const blocks = [...html.matchAll(/<details[\s\S]*?<\/details>/gi)].map((m) => m[0]);
      const safe = blocks.filter((b) => /\bMechWarrior\b/i.test(b)
        && /independent/i.test(b) && /original/i.test(b) && /\bNo\.|\bnot\b/i.test(b));
      const safeMentions = safe.reduce(
        (n, b) => n + (b.match(/\bMechWarrior\b/gi)?.length ?? 0), 0);
      if (safeMentions === hits.length) return null;
      return `${hits.length - safeMentions} mention(s) of MechWarrior outside the FAQ `
        + 'disclaimer. The only honest use is inside the answer stating that this game '
        + 'is NOT one; anywhere else risks implying an association that does not exist.';
    },
  },
  {
    name: 'play-button-present',
    check(html) {
      // The entire job of this page is to get someone into the game. If a
      // redesign ever loses the link, that should stop the build.
      const n = (html.match(/href="\/play"/g) ?? []).length;
      return n >= 3 ? null
        : `only ${n} link(s) to /play — the page must offer the game in the header, `
          + 'the hero and the close at minimum.';
    },
  },
  {
    name: 'no-stale-prototype-art',
    check(html) {
      // hero.jpg and friends are pre-Tripo captures of untextured boxes on flat
      // sand. One of them used to be the og:image on every share of this game.
      const stale = html.match(/\/site\/(hero|cockpit|map-drill|map-dunes|map-flats)\.jpg/g);
      return stale ? `stale prototype art referenced: ${[...new Set(stale)].join(', ')}` : null;
    },
  },
];

function deriveFacts(root) {
  const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
  const facts = {};

  // --- chassis -----------------------------------------------------------
  const mechs = read('content/mechs.json').mechs;
  facts.chassisCount = mechs.length;
  facts.chassisCountWord = numberWord(mechs.length);
  facts.lightestTons = Math.min(...mechs.map((m) => m.tons));
  facts.heaviestTons = Math.max(...mechs.map((m) => m.tons));
  facts.fastestKmh = Math.max(...mechs.map((m) => m.speedKmh));
  facts.weightClasses = new Set(mechs.map((m) => m.class)).size;
  facts.lightestName = mechs.find((m) => m.tons === facts.lightestTons).name;
  facts.heaviestName = mechs.find((m) => m.tons === facts.heaviestTons).name;

  // Assets live outside git (Drive-only, 400 MB), so the three asset-derived fact
  // groups below come from content/asset-census.json. censusForBuild re-derives that
  // census from the filesystem and throws on drift whenever the assets ARE present,
  // so these numbers still cannot exceed what shipped. See scripts/asset_census.mjs.
  const census = censusForBuild(root);

  // Machines modelled is a different number from chassis and must stay that way.
  facts.modelCount = census.models.length;
  facts.machinesModelled = census.models.filter((id) => id.startsWith('mech-')).length;

  // --- campaign ----------------------------------------------------------
  // Stages 1-3 are hardcoded in src/sim/campaign.ts; 4+ are data files. Parse
  // MAX_STAGE from the source rather than restating it here, so a campaign that
  // grows updates the page by itself.
  const campaignSrc = fs.readFileSync(path.join(root, 'src', 'sim', 'campaign.ts'), 'utf8');
  const maxStage = Number(/export const MAX_STAGE = (\d+)/.exec(campaignSrc)?.[1]);
  if (!Number.isFinite(maxStage)) throw new Error('[site-truth] cannot read MAX_STAGE');
  facts.missionCount = maxStage;

  const campaignFiles = fs.readdirSync(path.join(root, 'content', 'campaign'))
    .filter((f) => f.endsWith('.json'));
  facts.branchCount = campaignFiles.filter((f) => /\d+[ab]\.json$/.test(f)).length;

  // --- maps --------------------------------------------------------------
  const terrainSrc = fs.readFileSync(path.join(root, 'src', 'world', 'terrain.ts'), 'utf8');
  const mapUnion = /export type MapId =([^;]+);/.exec(terrainSrc)?.[1] ?? '';
  facts.mapCount = (mapUnion.match(/'/g)?.length ?? 0) / 2;
  if (!facts.mapCount) throw new Error('[site-truth] cannot read MapId union');

  // --- audio -------------------------------------------------------------
  const manifest = read('content/audio-manifest.json').entries;
  const keys = Object.keys(manifest);
  // Count lines that actually SHIPPED, not lines the manifest declares. Ten
  // entries (four nav cues and six Basic Training a4a/a4b prompts) are wired but
  // have no file on disk, so "607 recorded lines" overstated the build by ten.
  // The census records which vo.* keys resolve to a real file, so the number
  // self-corrects if they are ever generated, and can never again be larger
  // than reality.
  facts.voiceLines = census.shippedVoiceKeys.length;
  facts.musicCues = keys.filter((k) => k.startsWith('music.')).length;
  facts.sfxCount = keys.filter((k) => k.startsWith('sfx.')).length;

  // --- textures ----------------------------------------------------------
  // Three maps per set (albedo / normal / roughness).
  facts.textureMaps = census.textureFiles.length;
  facts.textureSets = census.textureFiles.length / 3;

  return facts;
}

/**
 * Markup fragments generated from game data.
 *
 * These are emitted as real HTML at build time rather than rendered by the
 * client for three reasons: the chassis names and mission titles are the page's
 * most valuable indexable text, the roster still works with JavaScript
 * disabled, and — like every other number here — they cannot drift.
 */
function deriveFragments(root) {
  const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const mechs = read('content/mechs.json').mechs;
  const weapons = Object.fromEntries(read('content/weapons.json').weapons.map((w) => [w.id, w]));
  const maxTons = Math.max(...mechs.map((m) => m.tons));

  // --- roster rail -------------------------------------------------------
  // data-* carries everything the spec panel needs, so selecting a chassis is a
  // dataset read rather than a second copy of the roster inside the bundle.
  const rosterList = mechs.map((m, i) => {
    const loadout = m.defaultLoadout
      .map((id) => weapons[id]?.name ?? id.replace(/_/g, ' '))
      .join(' · ');
    // Plain buttons with aria-pressed, deliberately NOT role="tab".
    // A tablist is a contract: tabs must own tabpanels via aria-controls and
    // manage a roving tabindex. Declaring the role without honouring either
    // makes a screen reader announce "tab 1 of 12" for a control that owns
    // nothing, which is worse than no role at all. A toggle button that says
    // "Flint, light, 118 km/h, pressed" describes exactly what this does.
    return `<button class="chassis__item${i === 0 ? ' is-on' : ''}" type="button"`
      + ` aria-pressed="${i === 0 ? 'true' : 'false'}"`
      + ` data-mech="mech-${esc(m.id)}"`
      + ` data-name="${esc(m.name)}" data-class="${esc(m.class)}"`
      + ` data-tons="${m.tons}" data-speed="${m.speedKmh}"`
      + ` data-twist="${m.twistArcDeg}" data-heat="${m.heatSinks}"`
      + ` data-jets="${m.jumpJets ? 'yes' : 'no'}"`
      + ` data-hp="${esc(m.hardpoints.join(','))}"`
      + ` data-role="${esc(m.role)}" data-loadout="${esc(loadout)}"`
      + ` data-pct="${Math.round((m.tons / maxTons) * 100)}">`
      + `<span><span class="chassis__name">${esc(m.name)}</span>`
      + `<span class="chassis__meta">${esc(m.class)} · ${m.speedKmh} km/h</span></span>`
      + `<span class="chassis__t">${m.tons}t</span></button>`;
  }).join('\n');

  // --- mission ladder ----------------------------------------------------
  // Stages 1-3 live in the campaign source; 4+ are data files. Both are parsed
  // rather than restated, so adding a mission updates the page by itself.
  const campaignSrc = fs.readFileSync(path.join(root, 'src', 'sim', 'campaign.ts'), 'utf8');
  const early = [...campaignSrc.matchAll(/\{ stage: (\d+), name: '([^']+)'/g)]
    .map((m) => ({ stage: Number(m[1]), title: m[2] }));

  const dir = path.join(root, 'content', 'campaign');
  const later = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { stage: c.stage, title: c.title, branch: /(\d+)([ab])\.json$/.exec(f)?.[2] };
  });

  const all = [...early, ...later].sort((a, b) =>
    a.stage - b.stage || (a.branch ?? '').localeCompare(b.branch ?? ''));

  const missionLadder = all.map((m) => {
    const num = m.branch ? `M${String(m.stage).padStart(2, '0')}${m.branch.toUpperCase()}`
      : `M${String(m.stage).padStart(2, '0')}`;
    return `<li class="op${m.branch ? ' op--fork' : ''}"><i></i><b>${num}</b>`
      + `<span>${esc(titleCase(m.title))}</span></li>`;
  }).join('\n');

  return { ROSTER_LIST: rosterList, MISSION_LADDER: missionLadder };
}

/**
 * Mission titles are stored shouting ("KRYCE'S VOICE"); the page sets its own
 * case. Word boundaries are whitespace and hyphens only — NOT the apostrophe,
 * which would produce "Kryce'S Voice" and "Rauk'S Wager".
 */
function titleCase(s) {
  return String(s).toLowerCase().replace(/(^|[\s\-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

function numberWord(n) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
    'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
  return words[n] ?? String(n);
}
