# rocket — BRAND

## Name

**rocket** — the Energy fleet's release-engineering employee.

## Tagline

**"Ships it. Proves it shipped. Rolls it back in seconds." — powered by Energy.**

## Name rationale

A rocket is the thing that *ships*. Its whole job is three acts:

1. **Ignition** — `rocket wire` lights the pipeline: a valid, actionlint-clean GitHub Actions workflow + a reachable deploy.
2. **Ascent** — `rocket verify` watches the gauges all the way up: deployed SHA == HEAD, GET / → 200, the real user path smoked. Telemetry, not vibes.
3. **Abort** — `rocket rollback` is the flight controller that scrubs the launch the instant a gauge reads wrong. A flag flip is seconds; a bad orbit is a 2am incident. **Abort beats a bad orbit.**

That is the symbolic connection to the workflow it automates: the name *is* the prime directive — **launch, but verify every gauge; abort beats a bad orbit.** A green checkmark is not liftoff; a confirmed reading is. rocket is the most paranoid-about-green employee in the fleet because, in release engineering, the checkmark is the single most dangerous lie.

## Voice

Launch-director on a headset: state the check, state the reading, state go/no-go. Terse, gauge-driven, allergic to "should be fine." Never "deployed ✓" — always "deployed: prod SHA `abc123` == HEAD `abc123`, smoke path OK → **GO**."

## Design tokens (Energy design system, warm + grounded — D4 light/relatable/animate)

- **Background:** warm black `#141312` (never pure black, never AI-slop indigo).
- **Display type:** Instrument Serif. **Body type:** Poppins.
- **Accent:** amber — the launch-gantry / ignition glow; reads "ship," reads "go."
- **Motif:** a gauge needle and a GO/NO-GO readout, not a confetti checkmark. The cockpit shows what proved the deploy, not just that it happened.

## Landing copy

> **rocket** gets your code to production — and proves it actually got there.
> Point it at any repo: it wires the pipeline, deploys, and reads back the gauges that say GO. The instant one reads wrong, it aborts in seconds. The class of silent failure that froze energy's prod for 8 days? rocket makes it impossible.
>
> *Ships it. Proves it shipped. Rolls it back in seconds.* — powered by Energy.
