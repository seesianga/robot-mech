# MechWarrior Extended Campaign — Asset Generation Prompts
## SECTION 3 — ELEVENLABS MUSIC (Background Score) for Operations 8 & 9

**Scope:** Companion to `mw4_elevenlabs_tripo3d_prompts.md` (Section 1 — voices, Section 2 — models). This section fills the missing layer: the background music. Every cue below maps to the nine missions in `mw4_extended_missions_op8-9.md`, plus the menu/briefing/hangar screens and adaptive stingers.

**How to use:** Feed one quoted prompt at a time into **Eleven Music** (`POST /v1/music`), with the render settings in §3.0. Append the shared style suffix (§3.1) to every prompt so the whole score reads as one game.

**A note on IP:** All cues are original compositions described by mood, tempo, and instrumentation. No prompt asks the model to imitate the MechWarrior 4 soundtrack (or any existing game/film score), and none should — the suffix enforces this.

---

## §3.0 RENDER SETTINGS — 192 kbps / 44.1 kHz PCM pipeline

**Target formats (per your spec):**

| Purpose | `output_format` | What you get | Plan required |
|---|---|---|---|
| **Master / editing** | `pcm_44100` | Raw 16-bit PCM @ 44.1 kHz (headerless — wrap to WAV, see below) | **Pro** tier or above |
| **Delivery / in-game** | `mp3_44100_192` | MP3, 192 kbps @ 44.1 kHz | **Creator** tier or above |

**Generate once, encode locally.** Each API call is a *new take* (generation is not exactly reproducible, even with a seed) and each call costs credits. So do **not** render every track twice. Render the master **once** as `pcm_44100`, then transcode that same take to 192 kbps MP3 yourself:

```bash
# Wrap the raw PCM into a WAV master (Eleven Music output is stereo 16-bit LE):
ffmpeg -f s16le -ar 44100 -ac 2 -i track.pcm track_master.wav
# Encode the identical take to the 192 kbps / 44.1 kHz delivery MP3:
ffmpeg -i track_master.wav -codec:a libmp3lame -b:a 192k -ar 44100 track.mp3
```
*(Sanity check: if the WAV plays at half/double speed or wrong pitch, flip `-ac 2` to `-ac 1`.)*

**If your plan is Creator (no 44.1 kHz PCM):** request `mp3_44100_192` directly from the API and skip the transcode — you lose the lossless master but keep the delivery spec.

**API call template:**

```bash
curl -X POST "https://api.elevenlabs.io/v1/music?output_format=pcm_44100" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "<CUE PROMPT + SHARED STYLE SUFFIX>",
    "music_length_ms": 180000,
    "model_id": "music_v1"
  }' --output track.pcm
```

- `music_length_ms` accepts **3,000–600,000 ms** (3 s–10 min); each cue below lists its length. Stingers are legal down to 3 s.
- For the multi-section mission cues, you can alternatively send a `composition_plan` instead of `prompt` (sections of 3 s–2 min, each with its own style and negative-style directions, with strict duration enforcement available) — useful when you want the section boundaries to land exactly where the gameplay phases change. `prompt` and `composition_plan` are mutually exclusive.
- As with the VO docs: **verify current model IDs, endpoints, and plan limits against the live ElevenLabs docs before batch-generating** — the lineup versions quickly.

**Mastering and integration rules (consistent with the VO pipeline docs):**
- Loudness: combat cues ≈ **−16 LUFS** integrated, ambient/menu beds ≈ **−20 LUFS**, true peak ≤ **−1 dBTP**. Leave headroom — footfalls, cannon fire, and VO sit on top of this score, and the dialogue bus sidechain-ducks music by ~6 dB.
- Looping: every prompt requests a clean loop-ready tail, but still trim the actual loop point to a bar boundary in your DAW; render mentality is "master long, cut tight."
- Keep the PCM/WAV masters archived; ship only the 192 kbps MP3s (or transcode further to Opus if your engine prefers a web codec).

---

## §3.1 SCORE BIBLE — shared language for every cue

**Two motifs bind the campaign:**
- **The Dresari motif** — three slow *rising* notes, first stated on a lone low horn. It means duty, and across Ops 8–9 it hardens: horn → massed low brass → (epilogue) bare piano. Appears in: Main Theme, 8-4, 8-5, 9-3, 9-4, Epilogue.
- **The Talon motif** — a clipped four-note military snare-and-muted-trumpet figure, precise and emotionless: Colonel Vane's professional menace. First heard *faintly* in 9-1, grows through 9-2/9-3, dominates 9-4 — and stops mid-figure when she falls.

**Palette:** hybrid military orchestral — low brass and contrabass mass, staccato string ostinati, industrial percussion built from metal strain and hydraulic impacts, analog synth pulses, military snare. Operation 8 sounds like **ash and aftermath** (weight, grief, a man hardening); Operation 9 sounds like **machined invasion** (colder synths, tighter snare, professional precision).

**Shared style suffix — append to every prompt below:**

> `— original instrumental hybrid-orchestral score for a military science-fiction walker-combat game, dark modern cinematic production, wide stereo image, no vocals, no choir, no lyrics, no trailer clichés, no imitation of any existing game or film soundtrack, mixed with headroom for radio dialogue and weapon effects, ending on a clean loop-ready tail`

*(For the one-shot stingers in §3.5, swap the final clause for: `dry ending with no reverb tail past the cutoff`.)*

---

## §3.2 GLOBAL & UI CUES

**M-00 · Main Theme — "Ashes of Victory"** · title screen / main menu · loop · `music_length_ms: 150000` (2:30)
"Main-title theme at 72 BPM in a dark minor mode. Open with wind and ember-like granular ambience, a single distant military snare, and the score's core motif — three slow rising notes on a lone low horn over sparse piano. Build patiently with low strings, industrial percussion made from metal impacts and hydraulic strain, and restrained brass. The climax is dignified, not triumphant — a victory that cost too much. Decay back to wind and the solo horn for the loop."

**M-01 · Briefing Room** · mission briefing / op map · loop · `music_length_ms: 90000` (1:30)
"Quiet war-room tension loop at 80 BPM. A soft synth pulse, a muted string ostinato, sparse low piano, faint teletype-like tick percussion, and one restrained low-brass swell at the end of each phrase. Low dynamic ceiling throughout, deliberately unobtrusive — a narrator's voice must sit clearly on top. No melody develops; the room simply waits."

**M-02 · The 'Mech Bay** · MechLab / loadout screen · loop · `music_length_ms: 120000` (2:00)
"Industrial-ambient hangar loop at 90 BPM with a half-time feel. A deep fusion-reactor hum drone, slow metallic percussion suggesting chain hoists and torque wrenches processed into rhythm, a warm low synth bass groove, and an occasional far-off horn hinting at the game's three-note rising motif. Workmanlike, confident, patient — machines being made ready."

**M-03 · Debrief — Victory** · post-mission success · one-shot · `music_length_ms: 45000` (0:45)
"A snare roll opens into a measured brass statement of a three-note rising motif over sustained strings, 84 BPM. Proud but weary — soldiers counting the cost, not celebrating. Resolves fully on a stable final chord."

**M-04 · Debrief — Defeat** · mission failed · one-shot · `music_length_ms: 30000` (0:30)
"A low dissonant cluster in strings and synth, then a falling two-note cello figure repeated twice, slower the second time, dissolving into tape-degraded silence. 60 BPM, hollow and final."

**M-05 · Epilogue — "A Hard Peace"** · campaign end / credits · plays through · `music_length_ms: 180000` (3:00)
"Credits suite at 66 BPM. A bare piano states a three-note rising motif plainly, joined gradually by mournful strings. Midway, a distant clipped military snare figure surfaces on the horizon and dissolves — a threat that has passed but is remembered. The ending is consonant yet unresolved in mood: peace, held by a hard man. Close on solo piano and room tone."

---

## §3.3 OPERATION 8 — "Ashes of Victory" mission cues

*Each mission cue is one generation containing distinct exploration → tension → combat sections that share a single motif. Slice the sections into separate loops at bar boundaries in your DAW; the game crossfades between them as intensity changes. (For exact section timing, rebuild any of these as a `composition_plan`.)*

**M-81 · "Countdown at the Starport"** — Op 8 M1 · `music_length_ms: 180000` (3:00)
"Urban assault cue at 118 BPM in three sections sharing one tense motif. Section one, the approach: ticking-clock percussion, muted synth arpeggios, and nervous staccato strings under a launch-countdown mood. Section two, the assault: full industrial drum kit, staccato low-brass stabs, and rising string lines locked to a relentless eighth-note pulse. Section three, the final minute: the same tempo but denser rhythmic subdivision and mounting snare pressure, as if the clock itself is accelerating. Urgent, mechanical, claustrophobic among fuel farms and hangars."

**M-82 · "The Argonne Remnant"** — Op 8 M2 · `music_length_ms: 180000` (3:00)
"Coastal naval battle cue, 100 BPM in 6/8. Rolling low drums in a wave-like swell pattern, brass surges that rise and crash without becoming nautical pastiche, sonar-ping-like synth blips used as musical punctuation, and urgent string arpeggios. A storm section thickens the percussion and adds wind-noise swells and deep thunder-adjacent bass hits, with visibility-lost moments of near silence between phrases. Shore guns, patrol boats, and one destroyer making for open water."

**M-83 · "Wolves of the Tundra"** — Op 8 M3 · `music_length_ms: 150000` (2:30)
"Arctic pursuit cue at 84 BPM, cold and sparse. Bowed metal, icy granular pads, soft taiko-like hits muffled as if heard through snowfall, and a lonely minor-key cello line. The combat section adds dry, aggressive close percussion and ragged desperate brass — raiders who were soldiers once, and the music grieves for them even as it fights them. Return to the empty wind and cello to loop."

**M-84 · "The Duke's Justice"** — Op 8 M4 · `music_length_ms: 165000` (2:45)
"Highland pursuit cue at 112 BPM. A galloping string ostinato over hand drums and military snare, terse brass interjections, momentum through switchback terrain. At the midpoint the percussion drops away entirely for a moral-choice passage: a solo viola against a cold synth pulse, weighing mercy against expedience. The chase then returns with the score's three-note rising motif hardened into massed low brass — judgment, not rescue. Chase section must loop cleanly."

**M-85 · "Karst Redoubt"** — Op 8 M5 · `music_length_ms: 210000` (3:30)
"Mountain-fortress siege cue at 96 BPM in three sections. One, the approach under the guns: massive slow percussion, sub-register brass pedal tones, and oppressive dread beneath towering walls. Two, the breach: a full assault of pounding low drums with fanfare fragments deliberately broken and scattered across the bars. Three, the cells: a sudden drop to clockwork tension — dry ticking percussion, high string harmonics, held breath — two hundred lives on a timer. End the third section on sustained tension suitable for looping until resolution."

---

## §3.4 OPERATION 9 — "The Archon's Answer" mission cues

**M-91 · "Eyes on the Drop"** — Op 9 M1 · `music_length_ms: 180000` (3:00)
"Night-infiltration cue at 76 BPM in two halves. First half, the stealth bed: a low synth drone, a slow heartbeat kick, insect-like granular ticks in the dark, and — very faint, very distant — the first statement of an antagonist motif: a clipped four-note military snare-and-muted-trumpet figure, professional and emotionless. Second half, detection: a repeated alarm-like synth stab ignites driving percussion and low strings for a running night exfiltration under searchlights. Both halves must function as independent loops."

**M-92 · "Cut the Chain"** — Op 9 M2 · `music_length_ms: 180000` (3:00)
"Timed bridge-defense cue at 120 BPM. A relentless snare-driven ostinato over a low brass pedal, with an engineer's-countdown tick woven inside the percussion pattern. At the detonation point: one full bar of silence, then a colossal combined orchestral-industrial impact with falling-debris textures and a slow settling of dust. A final withdrawal section runs leaner and faster — pursued, outnumbered, mission done. The clipped four-note snare motif of the enemy answers at the edges of the mix."

**M-93 · "The Line at Jeteel"** — Op 9 M3 · `music_length_ms: 210000` (3:30)
"Last-stand defense cue at 100 BPM built as three escalating waves of one theme, separated by brief resupply lulls for crossfading. Wave one: a lean skirmish groove of tight percussion and low strings. Wave two: added weight — doubled drums, brass counterlines, rising stakes. Wave three: a clipped four-note enemy snare figure at full force colliding head-on with a three-note rising heroic motif in horns and strings — costly, defiant, holding the line while civilians escape. End exhausted but unbroken."

**M-94a · "The Palace Approach"** — Op 9 M4, street battle · `music_length_ms: 150000` (2:30)
"Climactic urban battle cue at 108 BPM through a ruined capital. Full hybrid assault: artillery-like bass impacts, urgent string runs, massed low brass, industrial percussion at maximum controlled density. Two motifs collide throughout — a clipped four-note military snare figure against a three-note rising horn motif — neither winning, trading dominance bar by bar toward the palace gates. Loopable at full intensity."

**M-94b · "Duel at the Palace Gates"** — Op 9 M4, final duel · `music_length_ms: 150000` (2:30)
"One-on-one duel cue at 84 BPM. All communications are jammed and the orchestra strips away to almost nothing: a solo military snare and a solo low horn trade two opposing figures — a clipped four-note snare motif against a three-note rising horn motif — over a deep drone, like a formal argument between two soldiers. The texture tightens and accelerates into hard close-quarters percussion and brass, still essentially a two-voice fight. At the climax the snare figure stops mid-phrase, cut off — and the rising horn motif finishes alone, victorious and utterly exhausted."

---

## §3.5 ADAPTIVE STINGERS & GLUE

*One-shots layered over (or ducking) the mission cues at runtime. Use the dry-ending variant of the style suffix. Minimum legal length is 3,000 ms.*

| ID | Trigger | Length | Prompt |
|---|---|---|---|
| STG-01 | Enemy contact | 4 s | "A single sharp brass stab with a tight snare press roll, dark and martial, one gesture only" |
| STG-02 | Objective complete | 5 s | "A confident two-chord resolution in low brass and strings ending on a fragment of a three-note rising motif" |
| STG-03 | Enemy reinforcements | 5 s | "A rising dissonant brass-and-string cluster over an accelerating military snare, cut off abruptly at the peak" |
| STG-04 | Lancemate down | 6 s | "A falling two-note solo cello figure over a hollow low drone, grief-struck, decaying naturally" |
| STG-05 | Hostage / launch timer | 20 s loop | "A dry ticking tension loop: clock-like percussion, a rising filtered synth line, and high string harmonics, designed to sit underneath an existing combat cue and loop seamlessly" |
| STG-06 | Duel challenge (Vane) | 8 s | "A lone military snare roll swelling into one massive orchestral-industrial impact, then dead silence" |

---

## §3.6 PER-MISSION MUSIC CHECKLIST

| Mission | Primary cue | Stingers | Notes |
|---|---|---|---|
| 8-1 Starport | M-81 | STG-01/02/03, **STG-05** (launch timer) | Timer section = M-81 §3 + STG-05 layered |
| 8-2 Argonne | M-82 | STG-01/02 | Storm section under the final naval phase |
| 8-3 Tundra | M-83 | STG-01/02/04 | Keep the grief undertone; no heroics |
| 8-4 Duke's Justice | M-84 | STG-01/02 | Viola passage under the capture/destroy choice |
| 8-5 Karst Redoubt | M-85 | STG-01/03, **STG-05** (hostage phase) | M-85 §3 loops until cells are secured |
| 9-1 Eyes on the Drop | M-91 | STG-01/03 | Detection swaps stealth loop → exfil loop |
| 9-2 Cut the Chain | M-92 | STG-02/03 | Sync the silence bar to the bridge blowing |
| 9-3 Jeteel | M-93 | STG-01/02/03/04 | Wave lulls = ammo-truck resupply windows |
| 9-4 Palace Duel | M-94a → M-94b | STG-06 at the jamming, STG-02 post-duel | Hard cut from 94a to 94b when Vane jams comms |
| Menus / meta | M-00/01/02/03/04/05 | — | M-05 doubles as the newscast-epilogue bed |

---

## §3.7 BATCH GENERATION SCRIPT (PCM master → 192 kbps MP3)

```python
# pip install requests   |   requires ffmpeg on PATH
# Pro tier: PCM_MASTER=True (pcm_44100 master, local 192k encode — recommended)
# Creator tier: PCM_MASTER=False (direct mp3_44100_192 from the API)
import os, subprocess, requests

API_KEY = os.environ["ELEVENLABS_API_KEY"]
PCM_MASTER = True
SUFFIX = (" — original instrumental hybrid-orchestral score for a military "
          "science-fiction walker-combat game, dark modern cinematic production, "
          "wide stereo image, no vocals, no choir, no lyrics, no trailer clichés, "
          "no imitation of any existing game or film soundtrack, mixed with headroom "
          "for radio dialogue and weapon effects, ending on a clean loop-ready tail")

TRACKS = [  # (track_id, music_length_ms, prompt) — paste prompts from §3.2–§3.5
    ("M-00_main_theme", 150000, "Main-title theme at 72 BPM in a dark minor mode. ..."),
    ("M-81_starport",   180000, "Urban assault cue at 118 BPM in three sections. ..."),
    # ... remaining cues and stingers
]

fmt = "pcm_44100" if PCM_MASTER else "mp3_44100_192"
for tid, ms, prompt in TRACKS:
    r = requests.post(
        f"https://api.elevenlabs.io/v1/music?output_format={fmt}",
        headers={"xi-api-key": API_KEY},
        json={"prompt": prompt + SUFFIX, "music_length_ms": ms, "model_id": "music_v1"},
        timeout=600,
    )
    r.raise_for_status()
    if PCM_MASTER:
        raw = f"{tid}.pcm"; open(raw, "wb").write(r.content)
        subprocess.run(["ffmpeg", "-y", "-f", "s16le", "-ar", "44100", "-ac", "2",
                        "-i", raw, f"{tid}_master.wav"], check=True)
        subprocess.run(["ffmpeg", "-y", "-i", f"{tid}_master.wav", "-codec:a",
                        "libmp3lame", "-b:a", "192k", "-ar", "44100", f"{tid}.mp3"],
                       check=True)
    else:
        open(f"{tid}.mp3", "wb").write(r.content)
    print("done:", tid)
```

Run a human QC listen pass per track; regenerate flagged cues with a small prompt nudge (log the `seed` the API returns if you want to stay close to a take you liked). Trim loop points, master to the loudness targets in §3.0, and archive the WAVs.

---

## Branch notes — if Joanna survived Operation 6
- **M-84 (Duke's Justice):** the solo-viola "mercy" passage becomes the cue's emotional center rather than a detour — when slicing sections, let it lead into a restrained version of the chase instead of the hardened-brass ending.
- **M-85 (Karst Redoubt):** Falk surrenders, so §3 of the cue (the clockwork hostage tension) is replaced in-game by a low-intensity reuse of §1 as an escort bed; STG-05 is not triggered.
- All other cues are branch-agnostic.
