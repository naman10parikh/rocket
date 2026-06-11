---
title: "Field Intelligence — Migration war stories, bill-shock, and the Fly-vs-Vercel taste war"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [field, migration, vercel, flyio, cloudflare, bill-shock, serverless, rollback, taste, dispute, rocket]
researcher: "rocket FIELD-INTELLIGENCE (CP123 Wave-R)"
summary: "Lived migration stories (Vercel→Fly), the serverless bill-shock genre ($96K and $700 cases), Fly's official 'your data is gone if the host moves' admission, and the verbatim taste-war between serverful-believers and serverless-believers. Every claim carries URL + date + author/handle. Feeds GAPS-AND-DISPUTES."
---

# Field Intelligence — Migration war stories + the Fly-vs-Vercel taste war

> Currency: each claim has URL + date + author/handle. HN comment dates are approximate to the thread; thread IDs are given so anyone can re-verify. Older-but-durable items are flagged "[OLDER]".
> This is FIELD (what broke + what people believe), distinct from `ecosystem-vercel.md` / `ecosystem-flyio-railway.md` (features/pricing tables).

---

## 1. The canonical Vercel→Fly migration war story (OpenStatus)

**Source:** OpenStatus, "Why we migrated our backend from Vercel to Fly.io" — https://www.openstatus.dev/blog/migration-backend-from-vercel-to-fly **(2023-10-29 — [OLDER] but the failure modes are unchanged in 2026 and still the most-cited concrete migration; load-bearing)**. HN discussion: https://news.ycombinator.com/item?id=38062649.

**Why they moved (the trigger):**
- They needed a *lightweight REST API* (monitoring endpoints), and Vercel's own docs discourage Express-as-serverless: "It's possible to deploy an Express.js application as a single Serverless Function, but it comes with drawbacks." Next.js was overkill.
- **Startup/footprint:** Next.js cold start ≈ 2.5s / 110MB RAM vs Hono+Bun ≈ 0.19ms / 91MB.
- **Cost predictability:** one monitor across 6 regions ≈ $0.15/mo on Edge Functions → with 1,000+ monitors ≈ **$150/mo**. Fly fixed infra (6 servers, 2vCPU/512MB) = **$23.34/mo**. The driver was *forecastability* for a bootstrapped business, not just the absolute number.

**Everything that broke (the receipts):**
1. **Docker image bloat in a monorepo:** initial image 2GB → optimized to 700MB. "Vercel abstracted this away entirely." (You inherit Dockerfile discipline the moment you leave the PaaS.)
2. **Deploy timeouts:** frequent unexplained timeouts; workaround `flyctl deploy --wait-timeout=500`. "Fly deployments proved less reliable than Vercel's."
3. **No quick rollback:** "we have not discovered a quick method to rollback to the previous version" (konaraddi in the HN thread, echoing the post). This is the recurring Fly complaint.
4. **The Bun `CLOSE_WAIT` bug:** request failures spiked post-migration; closed connections stuck in `CLOSE_WAIT`; fix was setting `keepalive: false` — "a fix buried in GitHub issue #3327 with poor documentation."

**The taste they kept (important nuance):** "we still love Vercel, they offer a super product, it removes a lot of pain" — they kept Vercel for the *frontend*. Founder tibozaurus: "We are too [satisfied with Vercel] but for a simple REST API it might not be the best." **Lesson: the migration was surgical (backend only), not a divorce.** Rocket should default to "move the part that hurts, keep the part that works," not all-or-nothing.

---

## 2. The Fly.io footgun nobody reads until it bites: ephemeral storage + host-pinned volumes

**Source (OFFICIAL):** Fly.io docs, "Troubleshoot apps when a host is unavailable" — https://fly.io/docs/apps/trouble-host-unavailable/ (fetched 2026-06-11).

This is the single most important Fly operational fact for an agent, stated by Fly itself:

- **"Volumes are pinned to physical hosts, so when there's a host outage the volume is unreachable."**
- Ephemeral (non-volume) data on a Machine on a failed host is **lost — no recovery path.** (This is exactly what HN user **corobo** warned: "if my VM starts up on another physical host my data just no longer exists.")
- Recovery = restore from snapshot into a new volume, BUT **"We take snapshots once every 24 hours. Any data stored between the time when the snapshot was taken and the time when the restore is made will not be included."** → up to 24h data loss on single-Machine apps.
- **"The steps for recovery in this document don't guarantee that you'll be able to access your app if you have a single Machine on a host that's affected by an ongoing issue."**
- The mandated model: **"For production apps … we strongly recommend redundancy"** — run multiple Machines, and for stateful apps "have a clustering mechanism … to replicate data between multiple volumes."

**ROCKET RULE:** On Fly, **single-Machine + a volume = a data-loss incident waiting for a host failure.** "It's just a computer" (the pro-Fly mantra, §4) cuts both ways: you also inherit the computer's failure domain. Any Fly deploy plan an agent writes MUST check for: (a) >1 Machine, (b) replication for stateful volumes, (c) snapshot cadence < acceptable RPO. Corroborated by Fly's own infra log (cross-Atlantic Cogent failure misrouting registry traffic; ORD network instability) — https://fly.io/infra-log/ and https://status.flyio.net/history (2026). Real hosts fail; the platform doesn't hide it the way Vercel does.

---

## 3. The serverless bill-shock genre (the other side of "Vercel removes pain")

### 3a. The $96,000 month (Cara / Vercel functions)
**Source:** HN "Ninety-six thousand dollars spent solely on Vercel functions in one month" — https://news.ycombinator.com/item?id=40618220 (2024 — [OLDER] but the *mechanism* is the canonical serverless-bill-shock case still referenced in 2026).

- Scale: ~500K users, **56 million daily function invocations**.
- **The protection gap (the actual lesson), per davidlumley** (set up Vercel for Cara): "Your account does not appear to have spend management enabled, which would allow you to pause your project entirely if you hit a certain level of spend." **galacticfan**: "Spend management is also opt-in so it can be easy to miss." → **Vercel does NOT hard-cap by default** (unlike the Hobby tier). The bill can run to five/six figures silently.
- **The dispute (capture both sides):**
  - *Anti-serverless* — **unraveller**: "When you go serverless you are really just massively overpaying for uptime and thoughtlessness about scale." **delduca**: "Any USD ~400/month box should handle that traffic."
  - *Pro-serverless / it's-a-tradeoff* — davidlumley defends the original choice (zero users at the time, time efficiency) but concedes he'd enable spend caps starting over.
  - **Rocket's read:** both are right at different scales. Serverless is correct at zero-to-low and at spiky/unknown traffic; it becomes a tax once traffic is *predictable and sustained*. The bug isn't serverless — it's **not turning on spend caps**.

### 3b. The $700→$120 small-team version (more representative)
**Source:** Ibrahim Ahmed, "Vercel Bill Shock: From $700 to $120" — https://journeywithibrahim.medium.com/vercel-bill-shock-from-700-to-120-ec24ee9755c3 (2026). Corroborated by Vercel Community "Outrageous billing on a monorepo" — https://community.vercel.com/t/outrageous-billing-on-a-monorepo/34129.
- A client jumped from free/$20-Pro to **$700+/mo in one month** on a traffic spike. **Biggest culprit: function invocations** (400K+/mo over included). Plus **bandwidth overages** (Pro includes 1TB; ~$0.40/GB after) and **large JSON / un-optimized images**.
- This is the *common* case (not 500K users) — a few hundred K invocations + fat payloads is enough.

### 3c. The bandwidth/image-resize cost trap
**Source:** HN handles in the migration thread (38062649):
- **crooked-v:** abandoned Vercel image resizing — "bandwidth was 10x that of doing all media content through Prismic" as traffic scaled.
- **judge2020:** "Vercel charges $0.40/GB (over 1TB); AWS's most expensive region costs $0.15/GB" → ~2.5x markup.
- **NicoJuicy:** Vercel edge functions $150/mo vs Cloudflare ~$11/mo for the identical workload.

**ROCKET RULE:** When an agent picks Vercel, it MUST (1) enable Spend Management / a spend cap immediately (opt-in!), (2) flag image-optimization + egress bandwidth as the two costs that scale super-linearly with traffic, (3) for media-heavy or sustained-traffic apps, price Cloudflare/Fly/a-box before committing.

---

## 4. THE TASTE WAR — serverful vs serverless (verbatim, both sides)

This is the live disagreement among credible practitioners. Captured verbatim so GAPS-AND-DISPUTES can present both.

**Pro-serverful ("it's just a computer"):**
- **xmonkee** (HN 38062649): "Every day I need to add a new feature to my app, I am grateful I picked fly (serverful) rather than Vercel. The fact that as far as I'm concerned, it's just a computer, is incredibly useful." → The argument: a real long-running process gives you WebSockets, background jobs, cron, in-memory state, arbitrary runtimes — things serverless makes awkward.

**Pro-managed / anti-server-complexity:**
- **lmm** (HN 38062649): counters that managing servers creates its own problems — "cron is a terrible model … you generally [want] some kind of monitoring/alerting built in" vs the serverful "email-to-root" approach. → The argument: a server is also a pager, a patch cadence, a failure domain.
- **Swizec** (HN 38062649): "I've been deploying to AWS professionally for years and I'd choose Vercel for a personal project any day of the week. **Life's too short to play devops/sysadmin/sre without someone paying you.**"

**The synthesis the sources converge on (and OpenStatus lived):** use the *managed* PaaS for the part where its abstraction pays for itself (frontend, spiky/unknown traffic, zero-to-one), and drop to *serverful* for the part where you need a real process or where traffic is predictable enough that the PaaS premium becomes a tax. The mistake is treating it as a religion in either direction.

---

## 5. Centralization-of-trust risk (the 2026 update that changes the calculus)

**Source:** Vercel April-2026 security incident — official KB https://vercel.com/kb/bulletin/vercel-april-2026-security-incident; The Hacker News https://thehackernews.com/2026/04/vercel-breach-tied-to-context-ai-hack.html; HN https://news.ycombinator.com/item?id=47851634 (2026-04).

- **What happened:** a compromise that originated in a *small third-party AI tool* whose Google Workspace OAuth app was breached propagated to expose a *subset* of customer credentials / environment variables in some Vercel deployments. ShinyHunters persona claimed it; reportedly asked **$2M** for the data.
- **Why it matters for platform choice (the dispute):** HN's thread centered on "the risks of centralizing trust in deployment platforms." One camp: managed platforms concentrate your secrets (env vars) into one breach blast-radius. Counter-camp: a self-hosted box concentrates the *operational* risk on you, and you're statistically worse at secrets hygiene than Vercel. **No consensus — this is a genuine GAPS-AND-DISPUTES item.**
- **ROCKET RULE:** treat platform env-vars as a breach blast-radius. Prefer short-lived/rotated secrets and OIDC-federated cloud access over long-lived keys stored in the platform, regardless of which platform.

---

## 6. The 2026-specific shifts that invalidate 2025 conventional wisdom

1. **"Obscurity protects you" is dead** (see `field-gha-security-postmortems.md` §5: Feb 2026 AI mass-scanning). Applies to deploy too: exposed deploy webhooks/preview URLs are fuzzed.
2. **Vercel added Instant Rollback + Rolling Releases** (GA'd late-2025/2026, see `ecosystem-vercel.md`) — so the OpenStatus-era "Vercel rollback is easy, Fly's is hard" gap *widened*: Vercel now has first-class instant rollback while Fly still has no one-command rollback (HN konaraddi complaint stands as of the docs reviewed). If rollback speed is a hard requirement, that's now a real differentiator, not a wash.
3. **Spend caps still opt-in on Vercel as of 2026** (the $700 case is 2026). The 2025 advice "just watch your usage" is insufficient against a single traffic spike or a function-recursion bug — you need the cap *configured*, not monitored.

---

## 7. ROCKET DERIVED RULES (decision aids to bake in)

- **Choose Fly/serverful when:** you need a long-running process, WebSockets, cron/background jobs, in-memory state, a non-JS runtime, or traffic is predictable/sustained enough that PaaS-per-request pricing becomes a tax. **Then** mandate >1 Machine + volume replication + RPO-appropriate snapshots (the host-failure footgun).
- **Choose Vercel/managed when:** frontend, spiky/unknown traffic, zero-to-one speed, you don't want to own the failure domain. **Then** enable Spend Management *day one* and budget for bandwidth + image-opt egress.
- **Migrate surgically, not religiously** (OpenStatus pattern): move the part that hurts, keep the part that works.
- **Rollback is a platform-selection criterion in 2026** — Vercel instant-rollback vs Fly's missing one-command rollback is now a real gap.
- **Every platform's env-var store is a breach blast-radius** (Vercel Apr-2026). Prefer OIDC/short-lived secrets.

---

## Sources (this file)
- OpenStatus migration [OLDER 2023-10-29]: https://www.openstatus.dev/blog/migration-backend-from-vercel-to-fly + HN https://news.ycombinator.com/item?id=38062649
- Fly host-unavailable (official): https://fly.io/docs/apps/trouble-host-unavailable/ ; infra log https://fly.io/infra-log/ ; status history https://status.flyio.net/history
- $96K Vercel functions HN [OLDER]: https://news.ycombinator.com/item?id=40618220
- $700→$120 bill shock (2026): https://journeywithibrahim.medium.com/vercel-bill-shock-from-700-to-120-ec24ee9755c3 ; Vercel community monorepo billing: https://community.vercel.com/t/outrageous-billing-on-a-monorepo/34129
- Vercel April-2026 incident: https://vercel.com/kb/bulletin/vercel-april-2026-security-incident ; https://thehackernews.com/2026/04/vercel-breach-tied-to-context-ai-hack.html ; HN https://news.ycombinator.com/item?id=47851634
