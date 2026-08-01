# Inherited briefs — read-only reference

**Archived:** 2026-08-01. **Status:** frozen. Never edited, never built, never shipped.

These are the eight commissioning documents the AAA-redesign master prompt named as its inputs,
plus the master prompt itself. The convergence audit of 2026-07-29
([CONVERGENCE_PLAN.md](../../CONVERGENCE_PLAN.md) §0) recorded that none of them existed anywhere
on the Drive; on 2026-08-01 all nine were located outside the Drive in
`~/Downloads/prompt for MechWarrior/` and archived here.

Their arrival changes **nothing** in the adopted plan. The convergence decision (§0.1) was made on
the measured state of the repository, not on the presence or absence of these files. They are kept
because the master prompt's Appendix C requires the inherited briefs preserved as read-only
reference, and because two of them still have residual value noted below.

This directory is inside `docs/_inbox/`, which is **excluded** from CI Gates 7b/7c, from builds
and from shipped artefacts. Several of these files contain franchise-derived proper nouns that are
banned everywhere else in the repository — that is *why* they live here and nowhere else.

## Disposition

| File | Disposition under the convergence plan |
|---|---|
| `sovereign-ash-aaa-redesign-master-prompt.md` | **The commissioning brief.** Answered in full by [CONVERGENCE_PLAN.md](../../CONVERGENCE_PLAN.md); its §5/§6/§7/§3–§4/§8/§10 material is normative via [LIGHTING_STANDARD.md](../../LIGHTING_STANDARD.md), [PIPELINE_STANDARD.md](../../PIPELINE_STANDARD.md) and [PLATFORM_STANDARD.md](../../PLATFORM_STANDARD.md). Its Babylon 9 stack mandate is declined by [ADR-0001](../../adr/0001-renderer-three-vs-babylon.md), via the escape hatch its own §0 provides. |
| `sovereign_ash_master_web_game_prompt.md` | Superseded. Its rigour was imported through the standards; its canon (Nareth, the two factions) is **retired canon** and CI-scanned against. Reference only. |
| `sovereign-ash-hangar-master-prompt.md` | Veyra Prime ships its own hangar (bays, requisition, scrip economy — `docs/…/hangarcore`). Reference only; consult its duplicate/bay-economy rules if that economy is ever revised. |
| `sovereign-ash-basic-training-tutorial-master-prompt.md` | Veyra Prime's Basic Training already ships (29 data-driven steps, [tutorial-design.md](../../tutorial-design.md)). Its VO discipline is already a project-wide rule via PIPELINE §7. Reference only. |
| `mw4_extended_missions_op8-9.md` | **Franchise-derived; unshippable as written.** Its nine mission *structures* are legitimate reference for post-launch operations under the rewrite rule (see below). Cross-referenced from [BACKLOG_POST_LAUNCH.md](../../BACKLOG_POST_LAUNCH.md) §1. |
| `mw4_elevenlabs_tripo3d_prompts.md` | Franchise-keyed voice/model prompts: retired. Generator settings superseded by PIPELINE §6/§7. |
| `mw4_elevenlabs_music_prompts.md` | Historically important: its 192 kbps / 44.1 kHz PCM render pipeline is the origin of the project-wide audio standard (PIPELINE §7), which the live audio batch scripts already follow. Cue prompts retired. |
| `mech-tutorial-master-prompt.md` | Generic-engine tutorial spec; superseded by the shipped Basic Training. Reference only. |
| `mech-multiplayer-master-prompt.md` | Veyra Prime already runs 5v5 quick-match on a Durable Object. Its mode set and netcode requirements are reference for the post-launch MP expansion (BACKLOG §2). |

## The rewrite rule (binding on any use of the Op 8–9 material)

Rewrite from **beat outline**, never from the original text. Take the structure — a launch timer,
a turret grid, a hostage phase, a capture-or-destroy midpoint — and write new briefings, new
dialogue, new names, new terrain in Veyra Prime canon. If a sentence in the new mission could be
diffed against the old one and match, it is not a port, it is a copy.
