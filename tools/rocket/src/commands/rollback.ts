/**
 * `rocket rollback --target <repo>` — execute the rollback hierarchy fastest-first (B1).
 *
 * Encodes brain JOB5 + OP-5/OP-6 + P21: the 4-tier hierarchy (flag → alias re-point → image-pin →
 * git-revert), fastest first. RQ12 guard-never-guess: where the brain flags an unconfirmed/absent
 * mechanism (Fly has NO one-command rollback — P21), rocket EMITS A GUARD ("verify current syntax with
 * `flyctl --help` before applying") rather than hardcoding a command that could be wrong at 2am.
 *
 * B1 owns the hierarchy + the guard emission; live execution against a real platform (Vercel Instant
 * Rollback / wrangler rollback) is a thin Bash shell-out the verify/observability cluster wires durably.
 * The append-only GO/NO-GO + method trail is component 10 / E2.
 */
import type { CommandResult } from "../output.js";

export interface RollbackOptions {
  readonly target: string;
  /** an explicit prior deployment ID / image ref to roll back to (else rocket names how to find it). */
  readonly to?: string;
  /** the lane, to pick the right tier-2 mechanism (default vercel). */
  readonly lane?: "vercel" | "fly" | "cloudflare" | "railway";
}

/** One tier of the rollback hierarchy with its speed + the mechanism (or guard) for this lane. */
interface RollbackTier {
  readonly tier: number;
  readonly method: string;
  readonly speed: string;
  readonly mechanism: string;
}

/** Build the fastest-first hierarchy for the given lane, emitting GUARDS where the brain is unsure. */
function hierarchy(lane: string, to?: string): RollbackTier[] {
  const aliasTier: RollbackTier =
    lane === "fly"
      ? {
          tier: 2,
          method: "image-pin redeploy",
          speed: "minutes",
          // P21 guard — Fly has NO one-command rollback; do NOT hardcode, verify the syntax first.
          mechanism: `Fly has NO one-command rollback (P21). GUARD: verify current syntax with \`flyctl --help\` / \`fly releases\` before applying; redeploy the captured prior image (e.g. \`fly deploy --image <prior>\`)${to ? ` — candidate: ${to}` : ", which you must have captured at deploy time"}.`,
        }
      : lane === "cloudflare"
        ? { tier: 2, method: "version re-point", speed: "seconds", mechanism: `\`wrangler rollback\`${to ? ` ${to}` : ""} — re-point, no rebuild.` }
        : { tier: 2, method: "Instant Rollback (alias re-point)", speed: "seconds", mechanism: `Vercel Instant Rollback — re-point prod alias to a prior PRODUCTION-aliased deployment${to ? ` (${to})` : ""}. Hobby = previous-only; capture the prior prod deployment ID at deploy time.` };

  return [
    { tier: 1, method: "feature-flag kill switch", speed: "seconds–ms", mechanism: "flip the flag if the target uses a flag provider (OP-5) — BEATS redeploy by an order of magnitude. At 2am you do NOT want to run a build. (rocket references flags; it does not own a flag service.)" },
    aliasTier,
    { tier: 3, method: "git-revert + wait-for-CI", speed: "minutes", mechanism: "the BACKSTOP, not the primary — revert the commit and let the pipeline run." },
  ];
}

/**
 * Plan/execute a rollback. Returns the fastest-first hierarchy + the prior-good capture reminder.
 * `ok=true` (it's an actionable plan); live execution is a Bash shell-out the deploy cluster wires.
 */
export function runRollback(opts: RollbackOptions): CommandResult {
  const lane = opts.lane ?? "vercel";
  const tiers = hierarchy(lane, opts.to);
  return {
    command: "rollback",
    ok: true,
    summary: `rollback hierarchy for ${opts.target} (lane=${lane}), fastest-first: ${tiers.map((t) => t.method).join(" → ")}.`,
    data: {
      target: opts.target,
      lane,
      to: opts.to ?? null,
      hierarchy: tiers,
      priorGood: "capture the prior GOOD production deployment ID/image AT deploy time so rollback is one call (OP-6).",
      note: "B1 emits the hierarchy + guards (RQ12: guard, never guess — esp. Fly P21). Live alias re-point / wrangler rollback executes via a Bash shell-out; the GO/NO-GO + method lands in logs/runs.jsonl (component 10 / E2).",
    },
  };
}
