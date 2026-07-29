/**
 * §7.1 — plan gating. This decides the whole audio pipeline, so it runs BEFORE any batch.
 *
 *   Pro+     → pcm_44100 master, archived, 192 kbps encoded locally. Lossless master.
 *   Creator  → mp3_44100_192 requested directly. Delivery spec intact, MASTER LOST.
 *   below    → the pipeline does not run. §7.1 says this is intentional.
 *
 * Measured 2026-07-29: this account is on **creator**. So the fallback branch is live and
 * every line rendered today has no recoverable master. Generation is not bit-reproducible
 * even with a seed (§7.1 "generate once"), so re-rendering after an upgrade produces a
 * DIFFERENT TAKE — it does not recover the master. That is why renderAllowed() refuses to
 * run a batch on Creator without an explicit acknowledgement flag.
 */

const PRO_TIERS = new Set(['pro', 'scale', 'business', 'enterprise']);
const CREATOR_TIERS = new Set(['creator', 'independent_publisher', 'growing_business']);

export async function fetchPlan(apiKey) {
  const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
    headers: { 'xi-api-key': apiKey },
  });
  if (!res.ok) throw new Error(`ElevenLabs subscription check failed: HTTP ${res.status}`);
  const d = await res.json();
  const tier = String(d.tier ?? '').toLowerCase();
  const used = d.character_count ?? 0;
  const limit = d.character_limit ?? 0;
  return {
    tier,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    pctUsed: limit ? (used / limit) * 100 : 0,
    isPro: PRO_TIERS.has(tier),
    isCreator: CREATOR_TIERS.has(tier),
  };
}

/** §7.1 format selection — the master format if the plan allows it, else the fallback. */
export function formatFor(plan) {
  if (plan.isPro) {
    return { request: 'pcm_44100', master: true, note: 'lossless master archived, 192 kbps encoded locally' };
  }
  if (plan.isCreator) {
    return { request: 'mp3_44100_192', master: false, note: 'DELIVERY ONLY — no recoverable master (§7.1 fallback)' };
  }
  return { request: null, master: false, note: `tier "${plan.tier}" is below Creator — §7.1 refuses to run` };
}

/**
 * The safety interlock. Returns a refusal reason, or null when it is safe to render.
 *
 * Refuses when:
 *   - the plan cannot produce 192 kbps at all (§7.1 "the pipeline does not run")
 *   - the batch would exceed remaining quota (§2.4 credit metering)
 *   - the plan is Creator and the caller has not acknowledged that masters are lost
 *
 * `--i-accept-no-master` is deliberately verbose. A short flag gets copied into a script
 * and the acknowledgement stops being one.
 */
export function renderAllowed(plan, { characters, acceptNoMaster = false, overrideBudget = false }) {
  const fmt = formatFor(plan);
  if (!fmt.request) {
    return `§7.1: tier "${plan.tier}" cannot produce 192 kbps. Upgrade to Creator or above.`;
  }
  if (characters > plan.remaining && !overrideBudget) {
    return `§2.4: batch needs ~${characters} characters, only ${plan.remaining} remain `
      + `(${plan.pctUsed.toFixed(0)}% of quota used). Pass --override to proceed anyway.`;
  }
  if (!plan.isPro && !acceptNoMaster) {
    return `§7.1: on "${plan.tier}" every line is rendered WITHOUT a recoverable master, and\n`
      + '  generation is not bit-reproducible — re-rendering after a Pro upgrade yields a\n'
      + '  different take, it does not recover the master. Upgrade first, or pass\n'
      + '  --i-accept-no-master to render lossy-only deliverables deliberately.';
  }
  return null;
}
