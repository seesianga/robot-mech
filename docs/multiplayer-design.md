# Veyra Prime Multiplayer — Design & Production Package

The complete PvP suite specification, adapted from the source brief to what this project
actually is: an original-IP browser mech sim (TypeScript + three.js, static-hosted, no cloud
backend yet). Deliverables in order: design doc (§1), netcode & backend plan (§2),
ElevenLabs package (§3), Tripo3D package (§4), integration tickets (§5), phased delivery
(§6), acceptance criteria (§7). **What is already implemented and playable is marked
[SHIPPED]; everything else is the forward plan.**

## §0. Variable resolution & assumptions

| Variable | Resolution |
|---|---|
| {GAME_NAME} | Veyra Prime (original IP — the brief's franchise framing is adapted by role, never by name) |
| {GAME_ENGINE} | In-house TS engine (Vite + three.js + Rapier debris) |
| {NETCODE_STACK} | **[SHIPPED] Online: Cloudflare Worker + Durable Object match server** (`worker/`, deployed at https://veyra-prime.seesianga.workers.dev — the game and the match server share one origin; clients connect to `wss://…/ws`). LAN/dev fallback: the same protocol on a Node relay (`npm run mp`, port 4177), auto-selected when the site is served from a local address. Phase 2 = authoritative server-side mech sim at 30 Hz on the same protocol. |
| {BACKEND} | **Cloudflare Workers (free plan)** — static assets + Durable Object rooms. Match results are still session-local; persistent results/matchmaking are the Phase-2 backend ticket. |
| {MAX_PLAYERS} | 8 |
| {REGIONS} | n/a for LAN Phase 1; Phase 2 picks regions with the backend |
| {VOICE_CHAT_STACK} | None (text-free ping/bark comms by design; no runtime TTS, no player-name synthesis) |
| {PLATFORMS} | Web (desktop browser) |
| {VOICE_IDS} | Pinned in `scripts/gen_mp_audio.mjs` — announcer = the campaign Command voice ("Compact Net Control"), BATCOM = the exact tutorial/campaign CAIRN voice, 6 pilot packs on distinct premades |
| {CONCEPT_ART_DIR} | None — text_to_model throughout (§4) |

## §1. Multiplayer design

### 1.1 Match framework
- 2–8 players; lobby → chassis confirm (server-validated, stock-only for now) → 3 s drop
  countdown → match → results card → back to lobby. [SHIPPED for DM/TDM]
- **Tonnage is the balance currency**: TDM teams are auto-balanced by tonnage (greedy split,
  heaviest first), not headcount. [SHIPPED] Lobby host tonnage caps / weight-class limits /
  mutators: Phase 2 (server already enforces a per-player cap constant).
- Respawns: wave respawn — 15 s bots, 8 s players in LAN, 5 s in practice skirmish, with a
  3 s damage-immune window on the pad instead of immune spawn rooms. [SHIPPED]
- Out-of-bounds / overtime: Phase 2 (maps are basin-shaped; the arena edge is a natural wall).

### 1.2 The modes (5 vs 5 quick-match — matchmaking replaces hosted lobbies)

**Match assembly [SHIPPED]:** one JOIN button per mode. Everyone who joins inside the same
30-second window drops together (a full 10-pilot pool drops immediately); at zero, every
empty seat is filled by a **robot** — target-agnostic pilot AI simulated by its assigned
owner client, speaking the same protocol via a server-validated `who` field. A solo pilot
always gets a full 5v5 (4 friendly + 5 hostile robots).

| Mode | Status | Rules as implemented / planned |
|---|---|---|
| Deathmatch | **[SHIPPED]** online 5v5 + practice-vs-bots | **1 point per kill, first team to 20** (or highest at the 5:00 clock). Kills are victim-reported, server-credited; cross-team only. |
| Capture the Flag | **[SHIPPED]** online 5v5 | One neutral flag at field center. Stand it uncontested 5 s to **turn it your color**; while it's yours your team accrues **1 pt/s**, first to 100. Conversion is arbitrated by the match host client (server relays + accrues), flag repaints live for everyone. |
| Team Deathmatch (damage-scored) | folded into DM | The earlier damage-scored TDM ruleset is retired in favor of the kill-scored 5v5 DM above. |
| King of the Hill | Phase 2 | +1 pt/s sole occupancy; contested = nobody scores; relocation every 3 min. Hill pylon asset generated (vp_struct_shared_hill-pylon); announcer hill lines recorded. |
| Escort (VIP) | Phase 2 | Best-of-5 single-life rounds; VIP +20% armor, sensor-visible; announcer VIP lines recorded. |
| Steal the Beacon | Phase 2 | Carrier +1 pt/s, full-radar broadcast, torso glow; beacon asset generated (vp_prop_shared_beacon); carrier lines recorded. |

Server logic lives once in `server/matchcore.mjs` (queues, robot assembly, ownership
validation, scoring, clock) and runs unchanged in both transports: the deployed Durable
Object (`worker/matchlobby.mjs`) and the LAN Node relay (`server/mp-server.mjs`).

Every Phase-2 mode's announcer/BATCOM lines are **already recorded** (§3) so shipping a mode
is engine work only.

### 1.3 Lobby, social, progression
[SHIPPED] Private lobbies by 4-letter room code; host picks DM/TDM; chassis select from the
full 12-chassis stock roster with live tonnage; ready-up auto-drops at 2+ all-ready; results
card returns to menu. Practice Skirmish (vs bots) needs no server at all.
Phase 2: server browser, quickmatch, map vote, parties, spectators, mute/block/report,
AFK-kick, vote-kick in customs. Progression stays cosmetic-only; loadout legality identical
for everyone. Phase 3: ranked (tonnage-tiered MMR), bot backfill (needs target-agnostic AI —
today's pilot AI hunts the player only, which is why practice skirmish is score-attack),
replays, seasonal cosmetics.

## §2. Netcode & backend

**Phase 1 (shipped) — online relay on Cloudflare, honest about its trust model:**
- `worker/matchlobby.mjs` (Durable Object, deployed) and its protocol-identical LAN twin
  `server/mp-server.mjs` (Node + ws): rooms, lobby state, **server-side loadout legality**
  (chassis must exist in `content/mechs.json`, tonnage cap enforced — never trust the client),
  match clock, and all score bookkeeping. Nothing scores without the server agreeing.
  One lobby DO carries all rooms today (right-sized for private-match volume); per-room
  DO sharding via `getByName(code)` is the scale path.
- Combat relays peer-wise at ~12 Hz: position/leg-yaw/torso-aim/speed + a quantized
  per-component paper-doll (armor% + structure% per 8 zones + destroyed bitmask) — torso aim
  replicates separately from leg facing, and the paper doll a player sees is the owner's
  broadcast truth, not local guesswork.
- **Missile volleys / ballistics replicate as one fire event** (group + aim point), simulated
  locally on every client — an 8-rocket salvo is 1 packet, not 8 actors.
- **Victim-authoritative damage**: each client simulates all incoming fire against its own
  machine and reports attributed results (damage %, limb losses, death + killer) upstream.
  The server clamps per-report and per-second rates (a hacked claim stream caps out), tallies
  kills/limbs/damage points, and broadcasts the table. Replica paper-dolls self-correct from
  owner snapshots — divergence lives for under a second.
- Heat/shutdown/override are the owner's sim; heat hacks only cheat yourself into a coffin
  since damage you *take* is scored by your victim-side sim on other machines. Residual trust
  gaps (aimbot-grade truth, position spoofing) are accepted for LAN customs and closed by
  Phase 2's authoritative server.
- Bandwidth: state packets ≈ 300 B at 12 Hz ≈ 30 kbps up per client — far inside the brief's
  budget.

**Phase 2 — dedicated authoritative sim (the brief's full §2):** same message vocabulary,
but the server runs the mech sim at 30 Hz: client prediction for own movement/torso,
server reconciliation, 200 ms hitscan rewind, per-'Mech bitpacked component deltas,
transactional results to {BACKEND}, reconnect-to-match (60 s), CI soak with the §7 gates.
The mode layer (§1.2) is already data-driven off `MissionLike`, so no mode code changes.

## §3. Voice-over — ElevenLabs [SHIPPED]

All VO pre-baked offline, `mp3_44100_192`, never runtime-synthesized, player callsigns never
voiced. **171 files generated** by `npm run mpaudio` (idempotent; auto-patches the audio
manifest, keys `vo.mp.<line_id>`), from `content/vo/mp-lines.csv`:

- **ANNOUNCER — "Compact Net Control"** (40 lines): the campaign Command voice (pinned premade,
  stability 0.5 / style 0.3) — match flow, all six modes' explainers, every §1.2 objective
  global (flag/hill/VIP/beacon), score milestones, 60 s/10 s, overtime, win/loss/draw.
- **BATCOM** (11 new lines): the exact tutorial CAIRN voice + settings — carrier states,
  respawn/refit, lead changes, final minute. Cross-mode continuity is a feature.
- **PILOT PACKS ×6** (20 barks × 6 voices = 120 files): identical line list per pack
  (spotted / NAV calls / backup / fall back / affirmative / negative / low armor /
  overheating / kill confirm / flank / rockets / escort / hold), distinct premade voices,
  stability 0.6 / style 0.15, ≤ 6 words per bark. Localization and triggers stay 1:1.

**Trigger discipline [SHIPPED]**: `src/sim/announcer.ts` — one global announcer bus,
4 s per-category cooldown, 3-deep queue (stale entries drop); BATCOM bypasses the bus and
plays clean on the local channel; announcer runs through the radio-futz DSP ("arena net").
Pilot barks: Phase 2 wires them to the ping wheel + bot events, 3D-positional via the
existing distance-volume path.

## §4. 3D assets — Tripo3D

Competitive-readability rule governs everything: objective props identify by silhouette +
emissive alone at 500 m; team identity via tint, never geometry; cover collision is engine
boxes (honest, no invisible lips). `scripts/gen_tripo_mp.py` (idempotent):

| ID | Asset | Status |
|---|---|---|
| vp_prop_shared_flag | CTF flag standard | **GENERATED** |
| vp_prop_shared_beacon | carryable beacon case | **GENERATED** |
| vp_struct_shared_hill-pylon | control-ring emitter pylon | **GENERATED** |
| env_mp_spawn_gantry / repair_pad / wall / halfwall / bunker / comm_tower | 6 structural pieces | staged — the account hit zero credits mid-batch (403 code=2010); rerun `python3 scripts/gen_tripo_mp.py` after topping up |

Biome-retexture trick, LOD passes, and the QC gate (watertight, ground pivot, PBR complete,
500 m silhouette test, collision ≤ 10% of render tris) apply per the tutorial package's
conventions when the pieces move from viewer dressing into arenas. Arenas themselves ship on
the engine's procedural greybox (yard arena live today), same as the campaign maps.

## §5. Engine integration (as built + next tickets)

**Built:** one `MissionLike` match framework — `SkirmishMission` (stage 90) and `MpMission`
(stage 99) plug into the same launch/HUD/VO pipeline as campaign missions; `Mech.refit()` +
`respawn` callback (rebuilds visuals); `Mech.noKill` training fuse; net replicas skip local
physics and interpolate snapshots; menu lobby in `src/ui/start.ts`; announcer bus; match
timer HUD.
**Next tickets:** T1 objective actors (flag/beacon/hill as server-owned entities on the relay
protocol) · T2 CTF + Beacon rules on MpMission · T3 KotH zone scoring · T4 Escort rounds ·
T5 ping wheel + positional barks · T6 spectator cam · T7 server browser + backend results ·
T8 target-agnostic pilot AI (unlocks TDM bots + backfill) · T9 authoritative-sim migration.

## §6. Phased delivery
- **Phase 1 [DONE]**: DM + TDM over LAN, practice skirmish vs bots, loadout validation,
  announcer + BATCOM VO, lobby/menu, yard arena.
- **Phase 2**: the four objective modes (VO + hero props already in hand), more arenas via
  mood/retexture variants, pilot-pack wiring, server browser + parties + spectators.
- **Phase 3**: ranked, bot backfill, replays, seasonal cosmetics.

## §7. Acceptance (Phase-1 gates all pass)
- [x] 2-client LAN match completes the full loop: lobby → legality-checked ready-up → drop →
      live fire both directions → score/clock relay → results card (automated E2E).
- [x] Illegal chassis rejected server-side with a reason; damage-claim clamps enforced.
- [x] Fire events replicate as single packets; paper-doll corrects from owner snapshots.
- [x] Every scoring event maps to a recorded line; announcer never overlaps itself
      (bus cooldown + queue); BATCOM preempts locally.
- [x] Practice skirmish: full DM loop vs bots with §1.2 scoring, respawns both ways,
      zero campaign-progress writes.
- Phase-2 gates (30 Hz authoritative soak, 150 ms hit-reg parity, fuzzed loadout corpus,
  objective edge rules, 500 m silhouette test) carry over from the brief verbatim.
