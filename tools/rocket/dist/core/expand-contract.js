/**
 * expand-contract — classify a schema diff → reversible-within-deploy? + the 3-phase plan + the refusal
 * (B2 core check #5; the migrate-plan engine; OP-7 / brain/KNOWN-PITFALLS.md P23 / Sc.5.2).
 *
 * THE migration rule rocket refuses to bend (brain/OPINIONS.md OP-7): every migration must be reversible
 * WITHIN one deploy. Code rollback != schema rollback — "the promise of instant rollback becomes hollow
 * when your DB has evolved beyond what the blue environment can handle." A DROP/RENAME shipped in the SAME
 * deploy as code depending on the new shape is un-rollback-able BY CONSTRUCTION. The fix is always:
 *   1. EXPAND   — add the new alongside the old (rename = ADD new, keep old).
 *   2. DEPLOY   — new code writes BOTH; reads tolerate both.
 *   3. CONTRACT — drop the old in a SEPARATE later deploy, >=24-72h after the new shape is proven stable.
 *
 * This is `rocket migrate-plan`'s engine. Per RQ10 migrate-plan PLANS only (acorn owns the schema); it
 * never mutates a DB. Pure + table-driven + no network — classify the change kind, emit the plan, and
 * REFUSE (not silently allow) a destructive change coupled with dependent code in one deploy.
 */
// Table-driven classifier: ordered [regex, kind, additive, destructive]. First match per line wins.
// Tolerant of SQL and Prisma-style diff text; case-insensitive.
const RULES = [
    [/\bdrop\s+table\b/i, "drop-table", false, true],
    [/\bdrop\s+(column\b|constraint\b)|\bdrop\s+\w+\s*;?\s*$/i, "drop-column", false, true],
    [/\brename\s+table\b|\balter\s+table\s+\S+\s+rename\s+to\b/i, "rename-table", false, true],
    [/\brename\s+(column\b)|\brename\s+\w+\s+to\b/i, "rename-column", false, true],
    [/\balter\s+(column\b|.*\btype\b)|\b::\s*\w+/i, "alter-type", false, true],
    [/\bcreate\s+table\b|\+\s*model\s+\w+/i, "add-table", true, false],
    [/\bcreate\s+(unique\s+)?index\b/i, "add-index", true, false],
    [/\badd\s+column\b|\badd\s+\w+\s+\w+|\+\s+\w+\s+\w+/i, "add-column", true, false],
];
/** Classify one diff line into a ChangeKind. Destructive verbs are tested before additive ones. */
function classifyLine(line) {
    const raw = line.trim();
    if (raw.length === 0 || raw.startsWith("--") || raw.startsWith("#"))
        return null;
    for (const [re, kind, additive, destructive] of RULES) {
        if (re.test(raw))
            return { kind, additive, destructive, raw };
    }
    // a non-empty, non-comment diff line we couldn't classify — treat as unknown/destructive-until-proven
    // (fail safe: an unclassifiable schema change is NOT assumed reversible).
    if (/^[+-]/.test(raw) || /\b(alter|create|drop|add|rename)\b/i.test(raw)) {
        return { kind: "unknown", additive: false, destructive: true, raw };
    }
    return null;
}
/**
 * Classify a schema diff and emit the expand-contract plan + refusal.
 * @param diff the schema diff text (SQL migration, Prisma diff, etc.).
 * @param dependentCodeInSameDeploy whether the SAME deploy ships code depending on the new shape
 *   (default true — the dangerous assumption rocket guards against; OP-7). When true + destructive,
 *   rocket REFUSES.
 */
export function classifyMigration(diff, dependentCodeInSameDeploy = true) {
    const changes = [];
    for (const line of diff.split(/\r?\n/)) {
        const c = classifyLine(line);
        if (c)
            changes.push(c);
    }
    const hasDestructive = changes.some((c) => c.destructive);
    const reversibleWithinDeploy = changes.length > 0 && !hasDestructive;
    if (!hasDestructive) {
        // Purely additive (or empty) → one deploy is fine; rollback stays possible by construction.
        const phases = [
            {
                phase: "expand",
                when: "this deploy",
                action: "additive only (add columns/tables/indexes alongside existing) — backward-compatible, rollback-able within this single deploy. No contract phase needed.",
            },
        ];
        return {
            changes,
            reversibleWithinDeploy,
            phases,
            refusal: null,
            reason: changes.length === 0
                ? "no schema changes detected in the diff."
                : `additive-only migration (${changes.map((c) => c.kind).join(", ")}) — reversible within one deploy. Ship it.`,
        };
    }
    // Destructive present → the mandatory 3-phase split. Rollback is only possible if you DON'T collapse it.
    const destructiveKinds = changes.filter((c) => c.destructive).map((c) => c.kind);
    const phases = [
        {
            phase: "expand",
            when: "deploy N",
            action: "add the new schema ALONGSIDE the old (a rename = ADD the new column/table, keep the old). Backfill if needed. NOTHING is dropped here.",
        },
        {
            phase: "deploy",
            when: "deploy N (same release)",
            action: "ship code that writes BOTH old and new, and reads tolerantly. Prove stable in prod. This deploy is fully rollback-able (old shape still exists).",
        },
        {
            phase: "contract",
            when: "deploy N+1, >=24-72h after N is proven stable",
            action: `drop the old schema (${destructiveKinds.join(", ")}) in a SEPARATE later deploy. Only now is the destructive change applied — and only because the new shape has been stable long enough that you won't need to roll back past it.`,
        },
    ];
    const refusal = dependentCodeInSameDeploy
        ? `REFUSED: this diff is destructive (${destructiveKinds.join(", ")}) and would ship coupled with dependent code in ONE deploy — un-rollback-able by construction (code rollback != schema rollback). Split into the 3 phases above; the destructive contract phase is a separate deploy >=24-72h after the expand+deploy is proven stable. (rocket migrate-plan PLANS only — acorn owns the schema; this is the ordering/safety, not the execution.)`
        : null;
    return {
        changes,
        reversibleWithinDeploy,
        phases,
        refusal,
        reason: `destructive migration (${destructiveKinds.join(", ")}) — NOT reversible within one deploy. Requires the expand-contract 3-phase split; the destructive change is a separate later deploy (OP-7 / P23).`,
    };
}
