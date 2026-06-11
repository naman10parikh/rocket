---
title: "Field Intelligence — The GitHub Actions supply-chain incident CATALOG (each case: timeline + detection + prevention)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [field, github-actions, security, supply-chain, tj-actions, trivy, litellm, reviewdog, mutable-tags, incident-catalog, detection, prevention, rocket]
researcher: "rocket FIELD-INTELLIGENCE (CP123 Wave-R, gap-fill pass)"
summary: "A consolidated, reference-grade catalog of the named GHA supply-chain compromises a release-engineering agent must recognize on sight — tj-actions/changed-files (CVE-2025-30066, Mar 2025), reviewdog/action-setup (CVE-2025-30154), the aquasecurity/trivy-action force-push-75-tags chain → LiteLLM PyPI poisoning (Mar 2026), and TanStack (May 2026, cross-ref). Each entry: verbatim timeline, exact detection method (the forensic tell), and the specific prevention. Complements field-gha-security-postmortems.md (which deep-dives TanStack); this file is the breadth catalog + the mutable-tag attack class. Every claim carries URL + date + source."
---

# Field Intelligence — GHA Supply-Chain Incident Catalog (recognize on sight)

> This is the BREADTH companion to `field-gha-security-postmortems.md` (which is the DEPTH dive on TanStack May-2026). Here: every other named incident, each with the **three things an agent needs** — what happened (timeline), how it was *caught* (the forensic tell), and the *one* prevention that would have stopped it. The brief asked for "the GHA security incident catalog … each with detection + prevention" — this is that table, expanded.
> Currency: each claim dated, URL + source. Older-but-canonical flagged "[OLDER]". The CVE incidents are 2025; they are load-bearing because the *same attack class* (mutable-tag repointing) re-fired in 2026 (Trivy, TanStack).

---

## 0. The unifying attack class: MUTABLE-TAG REPOINTING (memorize this first)

Every incident below except the pwn-request variants shares ONE mechanism. An agent that understands this one paragraph can reason about all of them:

> A GitHub Action referenced as `uses: org/action@v1` (or `@v46`, `@master`) resolves the **tag to a commit at runtime**. Tags are **mutable git refs** — the maintainer (or an attacker who steals the maintainer's token) can `git push --force` the tag to point at a *different* commit. Your workflow file never changes; the code it runs silently does. This is why "pin to a full commit SHA" is the universal first prevention: a SHA is immutable, a tag is not.

**Source for the class:** Socket, "Trivy Under Attack Again: Widespread GitHub Actions Tag Compromise" (2026-03) — https://socket.dev/blog/trivy-under-attack-again-github-actions-compromise ; the same mechanism is named in the CISA alert below.

---

## 1. tj-actions/changed-files — CVE-2025-30066 (the index case)

**Sources:**
- CISA alert (2025-03-18, US-government primary): https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-tj-actionschanged-files-cve-2025-30066-and-reviewdogaction
- Wiz Research (2025-03, the detailed technical writeup): https://www.wiz.io/blog/github-action-tj-actions-changed-files-supply-chain-attack-cve-2025-30066
- Sysdig detection writeup (2025-03): https://www.sysdig.com/blog/detecting-and-mitigating-the-tj-actions-changed-files-supply-chain-attack-cve-2025-30066
- The Hacker News (scale figure): https://thehackernews.com/2025/03/github-action-compromise-puts-cicd.html
- GitHub Advisory GHSA-mrrh-fwg8-r2c3: https://github.com/advisories/ghsa-mrrh-fwg8-r2c3

**What it does:** `tj-actions/changed-files` reports which files a PR/commit touched. Used in **>23,000 repositories** (The Hacker News, 2025-03).

**The attack (verbatim mechanism):** the attacker gained access "through a compromised GitHub personal access token (PAT) used by @tj-actions-bot, a bot with privileged access to the repository" (Wiz, quoting the maintainers). They then **modified multiple existing version tags to point at a single malicious commit**. The injected Node function carried base64-encoded instructions that downloaded a Python script which **dumped the GitHub Runner process memory** (`/proc/<pid>/mem`) to harvest secrets. Those secrets then appeared as **double-base64-encoded strings in the public workflow logs**.

**Timeline (verbatim):**
- `2025-03-12` — compromise carried out (malicious commit + tags repointed)
- `2025-03-14` — StepSecurity discovers it (via their Harden-Runner detection)
- `2025-03-15 ~10:30 UTC` — the gist hosting the payload is taken down; the repo is temporarily removed, then restored *without* the offending commits
- `2025-03-17` — Wiz identifies the **related** `reviewdog/action-setup` compromise (CVE-2025-30154) — see §2; investigators believe reviewdog was the **initial foothold** used to compromise the tj-actions bot's PAT
- Patched in **v46.0.1**

**Secrets exposed:** "valid AWS access keys, GitHub Personal Access Tokens (PATs), npm tokens, and private RSA keys" (CISA / Wiz).

**THE DETECTION (the forensic tell):** because the leak surfaced as **double-base64 strings in workflow logs**, anyone could grep their *own* logs for the IOC after the fact. Runtime detection: Sysdig's **"Dump Memory using /proc/ Filesystem" rule** and Falco caught the memory-scan behavior live (Sysdig, 2025-03). **Hash-pinned consumers were safe** unless they updated during the 3-day window — proving the prevention below.

**THE PREVENTION:** "Pin all GitHub Actions to specific commit hashes instead of version tags" (GitHub guidance, quoted by Wiz). Plus: rotate all secrets that any affected workflow could touch; allow-list authorized actions org-wide.

---

## 2. reviewdog/action-setup — CVE-2025-30154 (the upstream foothold)

**Sources:** Wiz (2025-03-17): https://www.wiz.io/blog/github-action-tj-actions-changed-files-supply-chain-attack-cve-2025-30066 ; CISA alert (same as §1).

**Why it matters to the catalog:** this is the *cause behind the cause*. The reviewdog action was compromised first; the malicious code there is believed to have **harvested the tj-actions-bot PAT**, which was then used to repoint the tj-actions tags (§1). It is the canonical example of **a supply-chain attack that chains action→action** — you can be popped by a transitive action you never explicitly added, only because something you *did* add used it. This is the exact hole that DISPUTE 1 (SHA-pinning "comforting lie", in `field-taste-and-disputes.md`) is about: SHA-pinning your top-level action does **not** protect you if *that* action calls a mutable-tag action internally.

**Prevention:** same as §1 (SHA-pin), PLUS the harder lesson — **audit the transitive `uses:` tree**, not just your top-level workflow. There is no lockfile for Actions (the unresolved gap), so this is manual.

---

## 3. aquasecurity/trivy-action → LiteLLM (the 2026 re-run, with the BEST forensic detection story)

**Sources:**
- Socket (2026-03): https://socket.dev/blog/trivy-under-attack-again-github-actions-compromise
- Microsoft Security Blog (2026-03-24, detection/defense): https://www.microsoft.com/en-us/security/blog/2026/03/24/detecting-investigating-defending-against-trivy-supply-chain-compromise/
- Upwind (forensic timing tells): https://www.upwind.io/feed/trivy-supply-chain-incident-github-actions-compromise-breakdown
- Kaspersky (the Trivy/Checkmarx/LiteLLM "teampcp" cluster): https://www.kaspersky.com/blog/critical-supply-chain-attack-trivy-litellm-checkmarx-teampcp/55510/
- GitLab (cross-incident lessons): https://about.gitlab.com/blog/pipeline-security-lessons-from-march-supply-chain-incidents/

**What happened (timeline):**
- `2026-03-19/20` — attacker **force-pushed 75 existing tags** in `aquasecurity/trivy-action` to new malicious commits. "Any GitHub Actions workflow referencing a tag automatically resolved to whatever commit that tag pointed to at runtime. Once the tag was moved, the workflow consumed attacker code **without any change in the workflow file itself**." (Socket, 2026-03.) Trivy is *itself a security scanner* — so the blast radius was security-conscious orgs running it in CI.
- `2026-03-24` — the campaign reached **LiteLLM** (an AI-middleware library "embedded in approximately 36% of cloud environments"); malicious **PyPI versions 1.82.7 and 1.82.8** were published, "likely using credentials harvested from LiteLLM's CI/CD pipeline that used Trivy for security scanning." (Search-surfaced reporting + Kaspersky.)

**The downstream-blast insight (memorize):** "Credentials harvested from Trivy's CI/CD runners gave the attackers a foothold in downstream organizations **that had never directly used Trivy at all**." → A CI supply-chain compromise propagates by *stolen credentials*, not by your direct dependency graph. You can be a victim of an action you don't use, via a vendor who does.

**THE DETECTION — four forensic tells (this is the catalog's best detection content):**
1. **Impossible commit timestamps.** "Each malicious commit claimed a timestamp from the original release year (2021, 2022, etc.) but had a **parent commit dated March 2026** — physically impossible." (Upwind.) → An agent can detect tag-repointing by checking whether a tag's commit timestamp predates its parent's.
2. **Missing GPG signatures.** "The original Trivy releases were GPG-signed via the GitHub web UI. The replacement commits were **not**." (Upwind.) → Verify release-tag signatures; an unsigned commit on a historically-signed tag is a red flag.
3. **"0 commits to master since this release" anomaly.** GitHub's release UI showed that counter "for tags that should have been many versions behind master, indicating that each tag pointed to a commit whose **parent was the current master HEAD**." (Upwind.) → The repointed tags all parented off HEAD, betraying the force-push.
4. **Runtime behavioral baseline deviation.** Upwind's MDR "observed anomalous Trivy activity … that deviated from established runtime baselines … previously unseen command execution patterns tied to Trivy workflows." → Behavioral/EDR detection on the runner catches what static checks miss.

**THE PREVENTION:** SHA-pin (immune by construction — a force-pushed tag can't change a SHA reference); verify GPG signatures on release tags; and the **structural** fix Socket/GitLab both push: **artifact attestation + provenance** so the consumer can verify the build origin, not just the ref.

---

## 4. TanStack Router/Start — May 2026 (cross-reference, full depth elsewhere)

Deep-dived verbatim in `field-gha-security-postmortems.md` §1. The one-line catalog entry: **three-link chain** = pwn-request (`pull_request_target` running fork code) → **cache poisoning** across fork↔base → **OIDC token extraction from runner memory** (reusing the *verbatim* March-2025 tj-actions memory-dump script). Detected externally by StepSecurity's ashishkurmi within ~20 min of publish. Prevention: `repository_owner` guards + SHA-pin + don't checkout PR head under `pull_request_target` + **purge cache via API on incident**. Source: https://tanstack.com/blog/npm-supply-chain-compromise-postmortem.

---

## 5. The CATALOG TABLE (the on-sight reference)

| Incident | Date | Class | The one detection tell | The one prevention |
|---|---|---|---|---|
| **tj-actions/changed-files** (CVE-2025-30066) | 2025-03-12 | Mutable-tag repoint + runner-memory dump | Double-base64 secrets in **public workflow logs**; Sysdig "/proc mem-dump" rule | **SHA-pin** + rotate secrets + allow-list actions |
| **reviewdog/action-setup** (CVE-2025-30154) | 2025-03 | Action-chains-action (foothold for #1) | Identified by Wiz as the upstream of the tj-actions PAT theft | SHA-pin **+ audit transitive `uses:` tree** |
| **aquasecurity/trivy-action → LiteLLM** | 2026-03-19→24 | Mutable-tag repoint (75 tags force-pushed) → stolen-cred propagation to PyPI | **Impossible commit timestamps** (parent newer than commit); **missing GPG sig**; "0 commits since release" counter | SHA-pin + **verify GPG release sigs** + artifact attestation |
| **TanStack Router/Start** | 2026-05-11 | pwn-request → cache-poison → OIDC mem-theft (3-link chain) | External IOC analysis (StepSecurity) within ~20 min of npm publish | `repository_owner` guard + SHA-pin + no-checkout-PR-head + **API cache purge** |

**Pattern across all four:** (a) the entry vector is almost always a **mutable ref** (tag) or an **over-trusted trigger** (`pull_request_target`); (b) the payload is almost always **runner-memory credential theft** (the same `/proc/<pid>/mem` script literally gets copy-pasted between incidents); (c) **detection beat prevention every time** — external researchers/EDR caught these, not the victims' own pre-merge gates.

---

## 6. ROCKET DERIVED RULES (catalog-level, additive to the postmortems file)

1. **"Tag = mutable = untrusted ref."** Lint every `uses:` for a non-SHA ref → flag. This single rule would have made tj-actions, Trivy, AND reviewdog non-events for the linting repo.
2. **Verify release-tag GPG signatures** where the upstream signs them (Trivy did) — an unsigned commit on a historically-signed tag is a force-push tell.
3. **Check tag-commit timestamp sanity** — if a tag's commit timestamp predates its parent commit's timestamp, the tag was repointed (the Trivy forensic tell, automatable).
4. **Audit the transitive `uses:` tree, not just top-level** — reviewdog→tj-actions proves SHA-pinning your top action is insufficient if it calls mutable-tag actions internally. (This is the bridge to DISPUTE 1.)
5. **Assume credential-propagation blast radius** — you can be popped by a vendor's CI compromise even if you never used the action (Trivy→LiteLLM→36%-of-clouds). Short-lived/rotated creds + OIDC limit this.
6. **Invest in detection, not just prevention** — every case was caught by *behavioral/forensic* means (EDR baselines, log IOC greps, timestamp anomalies), not by the victim's CI passing. Rocket should ship a "scan my own action refs + logs for these IOCs" capability, not just a "harden before push" one.
7. **The mem-dump script is reused** — when a new incident drops, grep your runner logs/processes for `/proc/*/mem` access and `Runner.Worker` enumeration; it is the recurring signature.

---

## Sources (this file)
- CISA CVE-2025-30066 + CVE-2025-30154 alert (2025-03-18): https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-tj-actionschanged-files-cve-2025-30066-and-reviewdogaction
- Wiz tj-actions writeup (2025-03): https://www.wiz.io/blog/github-action-tj-actions-changed-files-supply-chain-attack-cve-2025-30066
- Sysdig tj-actions detection (2025-03): https://www.sysdig.com/blog/detecting-and-mitigating-the-tj-actions-changed-files-supply-chain-attack-cve-2025-30066
- The Hacker News (>23,000 repos): https://thehackernews.com/2025/03/github-action-compromise-puts-cicd.html
- GitHub Advisory GHSA-mrrh-fwg8-r2c3: https://github.com/advisories/ghsa-mrrh-fwg8-r2c3
- Socket Trivy tag compromise (2026-03): https://socket.dev/blog/trivy-under-attack-again-github-actions-compromise
- Microsoft Security Trivy defense (2026-03-24): https://www.microsoft.com/en-us/security/blog/2026/03/24/detecting-investigating-defending-against-trivy-supply-chain-compromise/
- Upwind Trivy forensic tells: https://www.upwind.io/feed/trivy-supply-chain-incident-github-actions-compromise-breakdown
- Kaspersky teampcp cluster (Trivy/Checkmarx/LiteLLM): https://www.kaspersky.com/blog/critical-supply-chain-attack-trivy-litellm-checkmarx-teampcp/55510/
- GitLab March-incidents lessons: https://about.gitlab.com/blog/pipeline-security-lessons-from-march-supply-chain-incidents/
- TanStack postmortem (cross-ref): https://tanstack.com/blog/npm-supply-chain-compromise-postmortem
