# Veyra Prime — Deep-Impression Checklist (Ship Gates)

These are the seven checks that define whether the game leaves the impression it was designed to leave. They are **ship gates**: 1.0 does not ship until **all seven pass in the same release-candidate build**. A pass in an earlier build does not carry forward.

**Cadence:** first full run at M2 exit (failures allowed, fix plans required). Re-run every two weeks through M3. Final run on the RC build with all sign-offs collected in one session.

**Tester sourcing rules:** "fresh players" have never played any build and receive no coaching beyond what the game itself provides. "Campaign-complete players" finished M1–M23 in the test build on their own. Developers and anyone who has watched extended dev footage are disqualified from fresh cohorts. Sessions are recorded (screen + face cam where consented) and telemetry-instrumented.

**Telemetry required for these tests** (must exist by M3): per-frame heat fraction, weapon-fire events, throttle position, shutdown events, tutorial-prompt display events, M20 choice-screen timing, frame-time capture, and a photo-mode/share action counter.

---

## Gate summary

| ID | Gate (from GDD) | Method | Sign-off |
|---|---|---|---|
| DI-1 | Litany gives goosebumps on M24 as on M1 | Longitudinal playtest survey + skip telemetry | Audio Director + Creative Director |
| DI-2 | First-timers instinctively slow at high heat | Fresh-cohort telemetry, no coaching | Systems Design Lead + QA Lead |
| DI-3 | Leg blown off = one action, five payoffs, every time | Deterministic scripted repetition | QA Lead + Game Director |
| DI-4 | Every biome identifiable from one screenshot + one second of ambient | Blind identification test | Art Director + Audio Director |
| DI-5 | Op6 choice provokes real hesitation | Decision-time telemetry + exit interviews | Narrative Lead + Creative Director |
| DI-6 | Final duel needs no tutorial text | Prompt-event audit + campaign-complete cohort | Combat Design Lead + Creative Director |
| DI-7 | Locked 60 on mid hardware; Ultra screenshots shared unprompted | Automated perf replays + unprompted-share observation | Tech Director + QA Lead + Art Director |

---

## DI-1 — The litany gives goosebumps on M24 as on M1

**Intent.** CAIRN's verbatim startup litany ("Core ignition confirmed. Actuator lattice — green. Weapon buses — live. Coolant loop pressurized. All boards answer ready. Good hunting, Lodestar.") opens every mission. After 24 missions it must still land as a signature moment — familiarity should deepen it, not dull it.

**Setup.**
- RC build, Regular difficulty, cockpit view, reference audio setup (headphones, calibrated level).
- Cohort: ≥8 playtesters completing the full campaign over multiple sessions (either branch).
- Telemetry: litany playback events, any input during playback, any skip/menu action during playback.
- Verify in-build first: the line is verbatim, clean (no radio futz), and present at the top of all 24 missions with the signature sound-design element (automated audio-event assertion, not manual listening).

**Steps.**
1. After the tester completes M1, administer a 3-question micro-survey: rate the startup moment 1–5, one word for how it felt, "would you skip it if you could?"
2. Repeat the identical survey after M13 (post-capture, somber context) and after M24 (final duel context).
3. Pull telemetry: count testers who sat still (no movement/fire input) through the M24 litany vs. the M1 litany.
4. Review face-cam/reaction footage for the M24 startup where consented.

**Pass criteria (all required).**
- Mean rating at M24 ≥ mean rating at M1, and M24 mean ≥ 4.0/5.
- ≥ 75% of testers answer "no" to wanting to skip at M24.
- No tester describes the M24 litany as "annoying," "repetitive," or equivalent in the one-word answer.
- Automated assertion confirms verbatim text, clean bus routing, and presence in 24/24 missions.

**Fail handling.** Failure is an audio-presentation problem first (mix placement, signature element, surrounding silence), not a writing problem — the line is locked. Fix and re-run with a fresh cohort.

**Sign-off.** Audio Director and Creative Director, jointly, with the survey data attached.

---

## DI-2 — First-timers instinctively slow down at high heat

**Intent.** Heat discipline must be taught by the game's own feedback (bar, klaxon escalation, CAIRN warnings, shimmer), not by text or coaching. A first-time player should visibly change behavior near redline within the first two missions.

**Setup.**
- Fresh cohort, N ≥ 8, no coaching, no observers speaking. RC build, Regular, missions M1–M2.
- Telemetry: heat fraction sampled at 10 Hz, weapon-fire events, shutdown events, override (O) usage.
- Define "fire cadence" = shots per 10 s window. Define "hot state" = heat ≥ 70% of redline.

**Steps.**
1. Each tester plays M1 and M2 in one sitting, think-aloud encouraged but unprompted.
2. Compute per-tester fire cadence in hot state vs. cool state, separately for the first half of M1 and for M2.
3. Count involuntary shutdowns per tester in M1 vs. M2.
4. Mark observational evidence: moments where the tester verbally acknowledges heat ("too hot," easing off) without any UI text telling them to.

**Pass criteria (all required).**
- By M2, ≥ 6 of 8 testers show ≥ 30% lower fire cadence in hot state than cool state (the instinctive slow-down).
- Median involuntary shutdowns in M2 ≤ 1 per tester, and every tester who shut down in M1 shuts down fewer times in M2.
- At least half the cohort verbalizes heat awareness unprompted.
- Zero testers report (exit question) that they learned heat from anything outside the game.

**Fail handling.** Tune feedback escalation (klaxon staging, CAIRN warning timing, HUD heat-bar salience, shimmer onset) — not the heat numbers themselves, which are a balance concern owned elsewhere. Re-run with a new fresh cohort (this test burns its cohort).

**Sign-off.** Systems Design Lead and QA Lead, with the telemetry summary attached.

---

## DI-3 — Leg blown off: one action, five payoffs, every time

**Intent.** Destroying a leg is the game's showcase of consequence density. One player action must reliably produce all five payoffs: (1) physics debris + sparks, (2) stumble animation into limp loop, (3) a VO bark (fireteam kill-condition confirm or CAIRN callout), (4) the gameplay change (speed cap + limp on one leg; kill on both), (5) the salvage payoff (legged-kill tier on the mission salvage screen).

**Setup.**
- Deterministic test mission: scripted arena, player in Skarn with Autocannon 40, enemy Gabbro AI enabled (not frozen — payoffs must fire under real conditions).
- Repeat matrix: 10 runs single-leg enemy, 5 runs double-leg enemy (kill), 5 runs player-side single leg loss (sim toggle "player limb-loss" ON).
- Capture: video of every run, audio-event log, salvage-screen screenshot per run.

**Steps.**
1. For each enemy single-leg run: sever one leg, observe until salvage screen. Check all five payoffs with timestamps (debris spawn ≤ 0.5 s from sever; stumble starts ≤ 0.5 s, limp loop persists; bark plays within 4 s — a priority bark must not be starved by the cooldown system; speed cap measurably applied; salvage screen shows legged tier and its yield exceeds the destroyed-by-ammo-explosion baseline recorded in a control run).
2. For each double-leg run: confirm kill, collapse animation (death A/B), debris, bark, and best-tier salvage.
3. For each player-side run: confirm debris + sparks from own mech, stumble/limp, speed cap on self, CAIRN component-loss line (clean, un-futzed), fireteam status bark (futzed).
4. Log any run where a payoff was missing, late, or visually broken (limb clipping through terrain counts as a fail for that run).

**Pass criteria.**
- 20/20 runs deliver all five payoffs within the timing windows. This gate is binary — "usually" is a fail, because this is the moment players clip and share.
- Salvage math verified: legged/headshot tiers > standard destruction > ammo-explosion, matching `content/` data.

**Fail handling.** Each missing payoff is a P1 against its owning system (physics, animation, VO priority, sim, salvage). Re-run the full 20-run matrix after any fix.

**Sign-off.** QA Lead and Game Director, with the 20-run log attached.

---

## DI-4 — Every biome identifiable from one screenshot and one second of ambient

**Intent.** Veyra Prime's biomes are the campaign's visual and sonic spine. Anyone should name the biome from a single still or a single second of ambient audio.

**Setup.**
- Assets under test: the 5 ambient-loop biomes (Halite Flats, Karst Highlands, Polar Refineries, Storm Coast, Vell Arcology) plus Breaker Coast and Spire Anchor stills for the visual half (7 visual identities total).
- Visual deck: 14 gameplay screenshots (2 per op environment), captured at Medium tier (not Ultra glamour shots), no HUD, no captions, shuffled.
- Audio deck: 10 clips of exactly 1.0 s (2 per ambient biome), loudness-matched, shuffled, no crossfade tails.
- Cohort: N ≥ 10 external testers who have seen at most marketing material, never played.
- Answer format: pick from a labeled list of the environments (with one decoy label included) — recognition, not free recall.

**Steps.**
1. Run the visual deck first (self-paced, one viewing per image), then the audio deck (one playback per clip, no replays).
2. Score per-biome accuracy, not just aggregate — one muddy biome must not hide behind six strong ones.
3. Collect one-line "how did you know?" answers to confirm identification came from intended identity cues (salt glare, karst sinkholes, polar night flare stacks, monsoon rain, arcology density) rather than incidental UI or geometry tells.

**Pass criteria (all required).**
- Visual: ≥ 90% aggregate accuracy AND ≥ 80% per-environment accuracy on every one of the 7.
- Audio: ≥ 80% aggregate accuracy AND ≥ 70% per-biome accuracy on every one of the 5.
- No two biomes confused with each other more than twice across the whole cohort (confusability check).

**Fail handling.** Per-biome fix: art identity pass (palette, silhouette, weather) or ambient redesign for the failing biome only; re-test only the failed deck with a fresh cohort.

**Sign-off.** Art Director (visual deck) and Audio Director (audio deck); both must sign for the gate to pass.

---

## DI-5 — The Op6 choice provokes real hesitation

**Intent.** M20 "The Registry" reveals Ekene's cell block AND the orbital-gun override codes — the player can act on only one. The choice (21a Extraction vs. 21b Override) must cause genuine deliberation: players should feel the cost of both paths, and the cohort should not treat one option as obviously correct.

**Setup.**
- Cohort: N ≥ 12 testers reaching M20 organically through campaign play (fresh to the choice; no spoilers, no prior builds containing M20).
- Telemetry: time from choice-screen display to committed selection; any cursor/controller hover changes between options; whether the player opened the recap of each option.
- The choice screen must present both stakes with equal visual weight and no difficulty labeling (the "harder/easier" distinction is internal design guidance, never shown).

**Steps.**
1. Record each tester's decision time and hover-switch count at the M20 choice.
2. Immediately after selection, one written question: "What did you give up?" (tests that the forfeited stake was understood).
3. Exit interview after the session: did they consider the other option seriously; would they replay for the other branch.
4. Aggregate the branch split across the cohort.

**Pass criteria (all required).**
- Median decision time ≥ 20 seconds; no more than 2 testers decide in under 5 seconds.
- ≥ 75% of testers switch hover/selection at least once before committing.
- 100% of testers correctly articulate what they gave up (both stakes were legible).
- Branch split no more lopsided than 75/25 across the cohort (an 80/20+ split means one option is under-weighted).
- ≥ 60% say in the exit interview they want to see the other branch.

**Fail handling.** This is a presentation and stakes-communication problem: rework the M20 reveal scene, the choice screen copy, or the preceding VO that builds Ekene's and the orbital gun's weight. Never fix by rebalancing mission difficulty to bribe players toward the weak option. Fresh cohort required for re-test.

**Sign-off.** Narrative Lead and Creative Director, with the decision-time distribution and split attached.

---

## DI-6 — The final duel needs no tutorial text

**Intent.** M24 "Reclamation" — comms jammed, Marshal Sol alone in the Craton-X, pure 1v1 on the anchor plate. Everything the duel demands (heat discipline, subtargeting, positioning, twist management, reading telegraphed AI cooling) must have been taught by M1–M23. Zero tutorial UI may appear, and players must not need it.

**Setup.**
- Build audit precondition: instrument every tutorial/hint UI string and prompt event in the codebase; run an automated check that M24's mission config can trigger none of them (this is a hard code assertion, not a playtest observation).
- Cohort: N ≥ 8 campaign-complete players (finished M1–M23 in the test build on their own saves and loadouts), Regular difficulty.
- Capture: video, input telemetry, duel AI state log (range bands, wound-threshold VO triggers).

**Steps.**
1. Confirm the automated zero-prompt assertion passes on the RC build.
2. Each tester plays M24 blind, up to 5 attempts, no coaching.
3. Reviewers mark "confusion events": ≥ 10 s of aimless input, verbalized "what am I supposed to do," or death attributable to not understanding a mechanic (vs. execution failure, which is fine and desirable).
4. Exit interview: describe Sol's behavior phases in their own words (tests that the duel AI's telegraphs — range-band shifts, heat back-offs, wound-threshold VO — were read as intended).
5. Verify the wound-threshold VO exchanges fired in the correct order in every attempt's log.

**Pass criteria (all required).**
- Automated assertion: 0 tutorial/hint prompts possible in M24. Binary.
- ≥ 75% of testers defeat Sol within 5 attempts on Regular.
- 0 confusion events attributable to an untaught mechanic across the cohort (execution deaths are not failures).
- ≥ 6 of 8 testers can describe at least two of Sol's behavior phases unprompted.
- Wound-threshold VO fired correctly in 100% of logged attempts.

**Fail handling.** If a mechanic confused campaign-complete players, the fix belongs in the mission that should have taught it (M1–M23), or in the duel AI's telegraphing — never in adding text to M24. Re-run with a new campaign-complete cohort.

**Sign-off.** Combat/Encounter Design Lead and Creative Director, with the confusion-event log attached.

---

## DI-7 — Locked 60 on mid hardware; Ultra screenshots shared unprompted

**Intent.** Two halves, one gate: the sim must hold a locked 60 fps at 1440p on RTX-3060-class hardware, and the Ultra tier must be beautiful enough that players share screenshots without being asked.

**Setup — performance half.**
- Reference machine: RTX-3060-class GPU, mid-range CPU, 1440p, the shipped auto-detected tier for that hardware (Medium/High), Chrome and Firefox both.
- Automated replay harness: recorded flythrough + combat replays of the three worst-case scenes — M15 (driving rain, naval monitor, hover skiffs, shore mechs), M17 (long night, three targets, dynamic reinforcements), M22 (lightning storm, shield pylons) — plus a 12-mech brawl stress scene.
- Capture: per-frame times, draw-call counts, initial-payload size from a cold cache load.

**Setup — impression half.**
- Cohort: N ≥ 10 testers with Ultra-capable hardware, RC build with photo mode / screenshot-share available but **never mentioned** by facilitators, multi-session play (≥ 3 hours each).
- Telemetry: photo-mode opens and share/save actions, correlated with session context.

**Steps.**
1. Run the replay harness on every RC candidate; archive frame-time traces.
2. Verify cold-load initial payload and per-op streaming sizes.
3. For the impression half: observe sessions; count unprompted screenshot/photo-mode actions and any unsolicited sharing outside the session (chat links, social posts) reported in exit interviews.
4. Art review of the shared images: do they showcase intended Ultra features (volumetrics, wet surfaces, tracer lighting, decals) or accidental moments?

**Pass criteria (all required).**
- Performance: across all four replay scenes on both browsers, no frame over 16.7 ms outside marked streaming transitions (99.9th percentile ≤ 16.7 ms); draw calls < 1500 in every captured frame; initial payload < 150 MB.
- Ultra stability: same replays on Ultra-capable hardware at 4K complete with zero crashes, zero visible shader compilation hitches after warm-up.
- Impression: ≥ 30% of the Ultra cohort takes at least one screenshot unprompted, and at least 2 testers share one outside the session entirely of their own accord.
- WebGL2 fallback: the performance replays also pass on the fallback path at the auto-selected tier (no frame over 16.7 ms; same draw-call and payload limits).

**Fail handling.** Performance failures are P0s against the owning scene/system with mandatory harness re-run. Impression failure triggers an Ultra showcase review (lighting scenarios, photo-mode ergonomics, the specific scenes players linger in) — re-observe with a fresh cohort.

**Sign-off.** Tech Director and QA Lead (performance half), Art Director (impression half). All three required.

---

## Final gate procedure

1. All seven checks executed against the **same RC build** within one two-week window.
2. Sign-offs collected in a single review session with evidence packets (surveys, telemetry, run logs, traces) archived alongside the build tag.
3. Any single failure blocks ship. Fix, cut a new RC, and re-run **the failed gates plus DI-7's performance half** (performance re-verification is mandatory after any change).
4. Ship recommendation is issued only with all seven signatures on the same build tag.
