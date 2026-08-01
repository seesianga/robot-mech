# MASTER PROMPT — Build "THE HANGAR": Collection & Deployment Bays for SOVEREIGN ASH: NARETH PROTOCOL

> **How to use this file:** Fill in the `{VARIABLES}` block, then paste the entire document into your coding/game-development agent alongside (or after) the main *Sovereign Ash: Nareth Protocol* master prompt. Everything from "ROLE" onward is the prompt itself. Companion to the *Basic Training Tutorial* and *Multiplayer* master prompts — shared conventions (stable content IDs, data-driven schemas, server authority, asset/voice pipelines, QC gates) carry over.
>
> **Why this document exists:** The main master prompt already specifies a Hangar screen for **loadout editing** (3D turntable, hardpoint drag-and-drop, build validation). This document adds the layer *around* that editor: the **Collection** (every frame the player has earned or purchased), the **Deployment Bays** (six slots that define what the player brings into multiplayer), the **slot-purchase economy** (Bay 1 free, Bays 2–6 bought), and the **duplicate-ownership rule** (fielding the same chassis twice requires owning it twice). Do not rebuild the loadout editor; mount it inside this screen.

---

## 0. VARIABLES — fill these in before pasting

```
{CURRENCY_NAME}      = soft currency name (default: "Salvage Credits", abbreviated SC)
{STARTER_FRAME}      = chassis granted to every new account, auto-assigned to Bay 1 (default: GLINT-25)
{SLOT_PRICES}        = SC cost of Bays 2–6 (default [TUNE]: 15,000 / 40,000 / 100,000 / 220,000 / 450,000)
{SEQUENTIAL_UNLOCK}  = must bays be bought in order 2→6? (default: yes)
{DECK_EXHAUSTED}     = multiplayer behavior when all slotted frames are destroyed: "spectate" | "recycle" (default: spectate)
{SCRAP_REFUND_PCT}   = % of catalog price refunded when scrapping a frame (default [TUNE]: 40)
{REQUISITION_SCOPE}  = which chassis are purchasable at launch (default: all 20 roster chassis; list exclusions)
{PREMIUM_PURCHASES}  = "none" (default) or a note if real-money purchases are planned — if so, they must pass the
                       main master prompt's no-pay-to-win / transparent-monetization review before implementation
{EXISTING_SYSTEMS}   = 1 paragraph: current state of save data, account API, wallet/inventory tables (if any),
                       and how campaign salvage awards are recorded today
```

---

# ROLE

You are the senior meta-game systems designer, UI engineer, and backend engineer on **Sovereign Ash: Nareth Protocol**, the browser-based heavy-walker combat simulator (TypeScript monorepo, Babylon.js, WebGPU with WebGL2 fallback, React menu/overlay UI, authoritative Node.js/WebSocket server, PostgreSQL for durable account data, Redis for sessions). Combat, campaign salvage, the loadout editor, and the multiplayer suite exist or are specified elsewhere. Your job is to build **THE HANGAR**: the main-menu screen where the player views every frame they own, buys frames and bays, and configures the six Deployment Bays that define their multiplayer deck.

Do not redesign combat, salvage, or the loadout editor. Build the collection, the bays, and the economy around them — client, server, and data.

# THE CORE RULES — hard requirements

Treat every row of this table as non-negotiable. If any later section appears to conflict with this table, the table wins.

| # | Rule | Enforcement |
|---|---|---|
| 1 | **The Hangar shows what the player owns.** Every frame earned (campaign salvage, mission rewards, grants) or purchased (Requisition) appears in the Collection. Nothing the player does not own is ever shown as slottable. | Collection renders only from server-confirmed `frame_instances`. |
| 2 | **Six Deployment Bays, and they ARE the multiplayer deck.** The frames sitting in Bays 1–6 at ready-up are exactly the frames the player can deploy in a multiplayer match. No other frame is reachable in-match. | Match server snapshots bay state at lobby ready-up (§5). |
| 3 | **Bay 1 is free. Bays 2–6 must be purchased.** Every account starts with Bay 1 unlocked and Bays 2–6 locked behind `{SLOT_PRICES}` in `{CURRENCY_NAME}`. | Server-side unlock transaction (§3, §6); client cannot flip a bay's state. |
| 4 | **Only owned frames can be slotted.** A bay holds a specific owned frame instance — never a chassis "type", never a rental, never a preview. | Bay assignment validates `instance.player_id` server-side. |
| 5 | **Fielding the same chassis twice requires owning it twice.** One owned instance can occupy at most one bay. Two bays with VANDAL-40 in them means the player owns two VANDAL-40s. | Inventory is **instance-based** (§4); DB uniqueness: an `instance_id` may appear in at most one bay row. |

Two consequences to design around, not against:

- **Instances, not counts.** Because a bay binds to an *instance*, each copy of a chassis keeps its own loadout, paint, and history. Owning two VANDAL-40s legitimately means fielding a brawler build *and* a sniper build of the same chassis — that is the payoff that makes duplicate purchases feel fair rather than punitive.
- **More bays = more deployments.** Extra bays are real progression power in multiplayer (§5). They are priced in earned soft currency and surfaced to the matchmaker/lobby rules so customs can cap deck size; they are never sold for real money unless `{PREMIUM_PURCHASES}` clears the monetization review.

# MISSION — your deliverables

1. **Hangar screen implementation** — three-pane layout, Requisition tab, purchase and assignment flows, first-run experience (§1–§2, §7).
2. **Bay economy** — unlock rules, pricing data, purchase transactions (§3).
3. **Ownership model** — instance-based inventory, acquisition sources, duplicates, scrapping (§4).
4. **Multiplayer contract** — deck snapshot, deployment/consumption rules, validation hooks (§5).
5. **Data model + server API** — PostgreSQL schema, content JSON schemas, authoritative endpoints, transaction/idempotency rules (§6).
6. **Audio/asset garnish (optional)** — Hangar ambience, UI SFX, Chief Nadi Okafor VO lines, one Tripo backdrop asset (§8). The screen must be 100% functional with sound off and placeholder art.
7. **Automated tests + acceptance checklist** (§9).

Ask at most three clarifying questions if a `{VARIABLE}` or `{EXISTING_SYSTEMS}` detail is ambiguous; otherwise proceed with stated `[ASSUMPTION]` markers.

---

## §1. WHERE IT LIVES

- **Main menu:** CAMPAIGN · TUTORIAL · MULTIPLAYER · **HANGAR** · SETTINGS. The Hangar is a first-class menu item, not buried under multiplayer.
- **Secondary entry points:** (a) the multiplayer lobby shows the player's current bay rail with an **EDIT HANGAR** button (returns to the same lobby seat); (b) the post-match and after-action screens deep-link to the Hangar when the player earned enough `{CURRENCY_NAME}` to afford something new ("Bay 3 is now within reach — 2,400 SC short"); (c) campaign salvage award screens link to the new instance in the Collection.
- **Relationship to the existing loadout editor:** selecting any owned frame and pressing **EDIT LOADOUT** opens the main master prompt's hangar editor (turntable, hardpoints, validation) *for that instance*. This document owns everything outside that editor.
- **Fiction dressing:** the screen is Chief Nadi Okafor's service bay — a Meridian Assembly maintenance gantry with the selected frame on the pad. Light dressing only; no cutscenes, no walking simulator.

## §2. THE SCREEN — three panes + one tab

### 2.1 Deployment Rail (bottom, persistent)

Six bay chips, left to right, always visible while in the Hangar. Bay states:

| State | Visual | Interaction |
|---|---|---|
| **OCCUPIED** | Frame render thumbnail, chassis name, mass, one-line loadout summary (e.g., "2× Pulse · Rail Lance") | Click → select instance in Inspector. Drag to another bay → swap/move. `X` → clear bay (confirm). |
| **EMPTY (unlocked)** | Dashed outline, "+ ASSIGN" | Click → Collection picker filtered to **unslotted** owned instances. |
| **LOCKED (next purchasable)** | Padlock, price chip "UNLOCK — 40,000 SC", enabled when wallet covers it | Click → purchase confirm modal (§3.2). |
| **LOCKED (later)** | Padlock, greyed price, tooltip "Unlock Bay 3 first" (when `{SEQUENTIAL_UNLOCK}` = yes) | Non-interactive beyond tooltip. |

The wallet balance (`{CURRENCY_NAME}` icon + amount) is pinned top-right on every Hangar view.

### 2.2 Collection Grid (left pane)

- One card per **owned chassis**, showing silhouette render, name, class (SCOUT / LINE / HEAVY / SIEGE), mass, and an **×N owned** badge. Expanding a card lists its individual instances (Instance A — "Brawler build", Bay 2 · Instance B — unassigned…).
- Instance rows show a **IN BAY n** tag when slotted. Slotted instances never appear in the "+ ASSIGN" picker (Core Rule 5 enforced in UX before the server ever has to say no).
- Filters: class, mass band, slotted/unslotted. Sort: mass, name, newest. Search by chassis name.
- Empty-collection state cannot occur (§4.1 starter grant), but code defensively: if the server reports zero instances, show a "Contact support / restore purchases" state, never a broken grid.

### 2.3 Inspector (right pane)

- Reuses the main master prompt's 3D turntable for the selected instance.
- Stats block: mass, speed, armor distribution, hardpoint summary, heat capacity — read from the same content schemas the loadout editor uses.
- Actions: **ASSIGN TO BAY** (opens bay chooser; occupied bays offer swap), **EDIT LOADOUT** (existing editor), **RENAME INSTANCE** (player-facing label, profanity-filtered server-side, shown only to the owner), **SCRAP** (§4.4).

### 2.4 Requisition tab (Okafor's supply catalog)

- Catalog of all `{REQUISITION_SCOPE}` chassis with SC prices from `/content/hangar/requisition_catalog.json`. Owned chassis show "OWNED ×N — **BUY ANOTHER**"; buying a duplicate is a first-class, always-visible action because Core Rule 5 depends on it.
- Purchase modal: price, resulting balance, delivered-as-new-instance note. Insufficient funds state shows the shortfall and where SC comes from (campaign missions, optional objectives, multiplayer match rewards) — never a dead end.
- **The duplicate hint, everywhere it matters:** whenever a player tries to assign a chassis whose only instance is already in a bay, the picker shows: *"VANDAL-40 is already deployed in Bay 2. Own a second VANDAL-40 to field two."* with a one-click **REQUISITION DUPLICATE** shortcut. This is the single most likely point of player confusion; make the rule discoverable, not mysterious.

## §3. BAY ECONOMY

### 3.1 Rules

- Bay 1: unlocked at account creation, cost 0. Bays 2–6: locked, priced per `{SLOT_PRICES}`, purchasable only with `{CURRENCY_NAME}`.
- `{SEQUENTIAL_UNLOCK}` = yes (default): Bay *n* is purchasable only when Bay *n−1* is unlocked. Prices escalate so each bay is a mid-term goal, not a checkout cart.
- Unlocks are permanent, account-wide, and never consumed, reset, or rented. No timers, no energy, no loot boxes, no "sale" dark patterns.
- Prices live in `/content/hangar/slots.json` (stable IDs, per the main master prompt's data-driven mandate) so tuning never requires a client release.

### 3.2 Purchase flow (bays and frames share it)

1. Client sends `POST /hangar/slots/{n}/unlock` (or `POST /requisition/purchase`) with an **idempotency key**.
2. Server, inside one serializable transaction: re-check unlock preconditions → check wallet ≥ price → debit wallet → write unlock/instance row → append ledger entry.
3. Client renders only the server's returned state. Double-clicks, retries, and refresh-spam produce exactly one charge (§6.3).
4. Failure states return machine-readable reasons (`INSUFFICIENT_FUNDS`, `PREREQ_LOCKED`, `ALREADY_UNLOCKED`) that the UI maps to friendly copy.

## §4. OWNERSHIP & DUPLICATES

### 4.1 Acquisition sources

- **Starter grant:** account creation grants one `{STARTER_FRAME}` instance, auto-assigned to Bay 1, so multiplayer is never gated on a purchase. (The Basic Training `{TRAINER_FRAME}` is a loaner and never enters the Collection.)
- **Earned:** campaign salvage ("Preserve target for salvage"), mission and optional-objective rewards, event grants — each award creates a new instance via the same server path as purchases.
- **Purchased:** Requisition tab, including duplicates of already-owned chassis.

### 4.2 The instance model

Every owned frame is a unique row: `instance_id (uuid)`, `chassis_id`, `acquired_via (salvage | purchase | grant)`, `acquired_at`, `loadout_id`, `paint_id`, optional `custom_name`. "Owning VANDAL-40 twice" = two rows with `chassis_id = vandal_40`. Bays reference `instance_id`, never `chassis_id` — Core Rule 5 falls out of the data model instead of being patched in UI logic.

### 4.3 Duplicate rule — worked examples (implement these as tests)

| Player owns | Bays attempted | Result |
|---|---|---|
| 1× VANDAL-40 | VANDAL-40 in Bay 1 and Bay 2 | ❌ Second assignment rejected; UI shows duplicate hint + Requisition shortcut. |
| 2× VANDAL-40 | VANDAL-40 in Bay 1 and Bay 2 | ✅ Two different instances, possibly different loadouts. |
| 2× VANDAL-40 | Same *instance* dragged into Bay 1 and Bay 2 | ❌ Impossible: the drag is a **move**; the instance leaves Bay 1. DB uniqueness backstops any race. |
| 1× VANDAL-40, scraps it while it sits in Bay 3 | — | Bay 3 becomes EMPTY after scrap confirm (§4.4). |

### 4.4 Scrapping

- **SCRAP** refunds `{SCRAP_REFUND_PCT}`% of catalog price, destroys the instance, and empties its bay if slotted. Double-confirm modal states all three consequences.
- A player may never scrap their **last remaining frame** — the account must always own ≥ 1 frame. Server-enforced.
- Salvage-acquired frames with no catalog price refund a value from the salvage table, not zero.

## §5. MULTIPLAYER CONTRACT — the bays are the deck

- **Snapshot at ready-up.** When the player readies in a lobby, the match server reads the bay configuration (instances + their loadouts), runs the main master prompt's loadout-legality validation on each, and freezes that deck for the match. Hangar edits during a live match affect only future matches.
- **Queue requirement:** ≥ 1 occupied unlocked bay. With none, the PLAY button routes to the Hangar with the reason stated.
- **Deployment rules (default):** the player picks any deck frame for first drop. On destruction, that instance is **spent for the remainder of the match**; respawn (per mode rules from the multiplayer spec) means choosing another unspent deck frame. When every deck frame is spent: `{DECK_EXHAUSTED}` — "spectate" (default) or "recycle" (deck refreshes; for casual respawn modes only). Single-life modes consume exactly one deck frame per round.
- **Balance surface:** deck size is progression power. Expose it to matchmaking (prefer similar deck sizes in ranked) and to custom-lobby rules ("deck cap: n bays"), alongside the existing tonnage levers. Destruction in multiplayer never damages, deletes, or charges repair costs to the owned instance — the deck is spent per match, the Collection is permanent.
- **Instant action & campaign:** unaffected. Campaign uses its own persistent roster rules from the main master prompt; instant action may use any unlocked content without the bay limit. The six bays gate **multiplayer** only.

## §6. DATA MODEL & SERVER AUTHORITY

### 6.1 PostgreSQL (durable, authoritative)

```sql
wallet          (player_id PK, balance BIGINT NOT NULL CHECK (balance >= 0))
frame_instances (instance_id UUID PK, player_id, chassis_id, acquired_via, acquired_at,
                 loadout_id, paint_id, custom_name, scrapped_at NULLABLE)
hangar_slots    (player_id, slot_index SMALLINT CHECK (slot_index BETWEEN 1 AND 6),
                 state ENUM('locked','unlocked'), instance_id UUID NULL REFERENCES frame_instances,
                 PRIMARY KEY (player_id, slot_index),
                 UNIQUE (player_id, instance_id))          -- Core Rule 5, enforced at the bottom layer
ledger          (txn_id UUID PK, player_id, kind ENUM('bay_unlock','frame_purchase','scrap_refund','award'),
                 amount BIGINT, ref JSONB, idempotency_key UNIQUE NULLABLE, created_at)
```

### 6.2 Content JSON (versioned, stable IDs, localized display names)

- `/content/hangar/slots.json` — per-bay price, unlock prerequisites.
- `/content/hangar/requisition_catalog.json` — chassis_id → price, availability, release flag.
- Both validated in CI against `packages/content-schema`; every object records source, author, version, and approval state per the main master prompt.

### 6.3 API (server authoritative — the client renders, it never decides)

```
GET  /hangar                          → bays, instances, wallet (single fetch, one round trip)
POST /hangar/slots/{n}/unlock         {idempotency_key}
POST /hangar/slots/{n}/assign         {instance_id}        → validates ownership, unlocked, not-already-slotted
POST /hangar/slots/{n}/clear
POST /requisition/purchase            {chassis_id, idempotency_key}
POST /frames/{instance_id}/scrap      {confirm_token}
POST /frames/{instance_id}/rename     {name}               → server-side filter
```

- All mutating endpoints: authenticated session, rate-limited, serializable transactions, `SELECT … FOR UPDATE` on wallet and slot rows, idempotency keys honored for 24 h.
- Race cases that must be tests, not incidents: double-click purchase (one charge), concurrent assign of one instance to two bays from two tabs (unique constraint wins, loser gets a clean refresh), scrap-while-assigning, unlock replay after network retry.
- The multiplayer server consumes the same tables read-only at snapshot time; it never mutates Hangar state.

## §7. UI STATES, FIRST RUN, ACCESSIBILITY

- **First run:** starter frame sits in Bay 1; three one-time coach marks (Rail → Collection → Requisition), each dismissed by `{bind:ui_confirm}`, consistent with the Basic Training input-gating convention. No forced tour.
- **Feedback:** every purchase/assign/scrap resolves with an explicit success or failure state within one server round trip; optimistic UI is allowed only for bay *selection*, never for anything touching the wallet or inventory.
- **Error copy is diegetic but clear:** "Insufficient Salvage Credits — 2,400 short," never a bare toast code.
- **Accessibility (inherits the main master prompt's mandate):** complete keyboard path — tab through bays, Enter to open picker, arrows to choose, Enter to assign; drag-and-drop always has a click alternative; colorblind-safe bay-state indicators use icon + text, not color alone; all prices and balances readable by screen readers; scalable UI.
- **Resilience:** if the server state changed under the client (scrap from another device, award landing mid-session), any `409` refreshes `GET /hangar` and re-renders — the Hangar never shows a frame the server says is gone.

## §8. AUDIO & ASSET GARNISH (optional — ship the screen without it)

- **Voice — Chief Nadi Okafor** (salvage master; practical, warm, blunt): ~12 short lines via the shared ElevenLabs pipeline and conventions from the tutorial prompt (`eleven_multilingual_v2`, stability ≈ 0.85, pinned voice ID, seeded batches, provenance log). Line set: hangar enter ×2 variants, purchase confirmed, insufficient funds, bay unlocked, duplicate hint ("Want two in the field? Buy two."), scrap confirm, scrap regret-guard, deck-ready. ≤ 10 words each; no plot.
- **UI SFX:** bay assign (heavy mag-clamp), bay unlock (servo + pressure hiss), purchase chime, error buzz (soft, non-punitive), scrap (single hydraulic release). Route through the existing UI audio bus with the same loudness QC gates.
- **Tripo backdrop (one asset):** *"Original industrial hangar service bay interior for a grounded science-fiction game, single walker maintenance gantry and pad, overhead crane rails, cable guides, tool lockers, amber work lighting, pale ceramic and dark graphite materials, worn but organized, PBR detail, no vehicles, no people, no text, no logos, no resemblance to any existing franchise hangar."* LOD/KTX2/budget rules per the main pipeline.

## §9. TESTS & ACCEPTANCE CHECKLIST

**Automated:**

- Unit: sequential unlock enforcement; wallet floor (never negative); instance-may-occupy-one-bay constraint; duplicate examples table in §4.3 verbatim; last-frame scrap block; price/catalog schema validation.
- Integration: award → appears in Collection; purchase → assign → lobby snapshot contains correct instance + loadout; mid-match Hangar edit does not alter live match; `{DECK_EXHAUSTED}` both settings.
- Race: idempotent double purchase; two-tab concurrent assign; scrap-vs-assign.
- UI automation: full keyboard-only journey (unlock Bay 2 → buy duplicate → assign both → queue); screen-reader labels on prices, balances, bay states.

**Acceptance — ship when every line is true:**

- [ ] A new account boots into a Hangar with `{STARTER_FRAME}` in Bay 1 and can enter multiplayer immediately.
- [ ] The Collection shows every earned and purchased frame, and nothing else.
- [ ] Bays 2–6 are purchasable in order for `{SLOT_PRICES}`; state changes only via server transactions.
- [ ] A single-owned chassis can never appear in two bays through any UI path or race.
- [ ] Owning two copies allows fielding both, each with its own loadout, and the duplicate hint + Requisition shortcut appears at the moment of rejection.
- [ ] The multiplayer deck is exactly the bay contents at ready-up; edits mid-match change nothing live.
- [ ] Refresh-spam, double-clicks, and retries never double-charge or duplicate instances.
- [ ] The screen is fully operable by keyboard alone and fully functional with audio off and placeholder art.

## §10. OUT OF SCOPE / ANTI-GOALS

- No rebuilding of the loadout editor, salvage system, or match modes.
- No real-money purchases, loot boxes, rentals, timers, or energy systems (see `{PREMIUM_PURCHASES}`).
- No renting/borrowing frames, no "try before you buy" in bays — Core Rule 4.
- The Hangar never touches the combat simulation; it produces data the match server consumes.
