# Velayo OS — Agents

*Last updated: 2026-08-05 (created — the ladder, promotion line, counting rule, employment rules, the **Dev / Ops / Growth** grouping, and the founding roster.)*

---

## Purpose

This document governs the crew of the software factory: what counts as an agent,
how a job gets promoted into one, what every agent is forbidden to do, and who is
currently on the roster.

It exists because the leverage gauge (1 human : 20 agent-tasks) is becoming
external positioning, not just an internal metric. A number you say to yourself
does not get audited. A number you say to an investor does. The rules below
deliberately make that number **smaller** — see "Why the rules make the number
smaller," which is the section a future founder under fundraising pressure will
want to relitigate.

---

## 1. The ladder: Ritual → Seat → Agent

A job is promoted through three tiers. It is never assumed into one.

| Tier | Definition | Counts toward gauge |
|---|---|---|
| **Ritual** | A procedure a human performs from memory or a checklist. Repeatable, but undocumented enough that only the founder can run it. | No |
| **Seat** | The ritual has a written job description: trigger, steps, output format, verification. Anyone — or anything — could run it. Still staffed by a human. | No |
| **Agent** | The seat runs its whole job unattended and returns a result a human can grade. | Yes |

The Seat tier is the same principle the Harbour applies to lanes: **the charter
exists before the headcount.**

### The promotion line

> **The human may stand at the gate, but not on the assembly line.**

- Reviewing a finished commit is a **gate**. Still an agent.
- Carrying a file from step 3 to step 4 is the **assembly line**. Still a seat.

This is the whole test. It is why Scribe — fully specified, proven, verified — is
not yet an agent: a human is its transport layer. It is also why a Tester that
reports failures without fixing them **is** an agent: it ran its whole job, and
the human acts on the output.

### The four qualifying conditions

An agent has:

1. A job description narrow enough to **fail visibly**.
2. A trigger it can act on with **no human between its own steps**.
3. An output another system can **verify deterministically**.
4. A **bounded blast radius** — it cannot reach prod or any irreversible boundary
   without a human.

---

## 2. The counting rule

The gauge counts **tasks, not seats**. A task counts when it:

1. Would otherwise require a human,
2. Now completes with no human between its steps, and
3. Emits a signal that can be checked.

**Binary. No partial credit. No fractions. No "mostly automated."**

Rituals and Seats count **zero**, not partial credit.

The gauge is **company-wide**, not per-app. One human against all agent-tasks
across the fleet — because there is one human. Note the consequence: as the fleet
grows, hitting 1:20 must not be mistaken for done. The target rises with headcount.

> Phrasing note: the rule says *"would otherwise require a human,"* not *"used to
> cost Dan time."* The second phrasing breaks the moment there are colleagues.
> The rule is written to survive the 30-employee version of the company.

### Instruments are equipment, not crew

**Detectors do not count. The agent that acts on their signal does.**

Splunk Synthetics runs unattended and emits a gradeable signal, so by a literal
reading of the counting rule it would qualify. It is ruled **out**: Synthetics is
an instrument the Watchman reads. So are the RUM error detector and any future
probe.

This is precedent for every detector that follows. Ship as many instruments as the
system deserves; none of them inflate the gauge.

---

## 3. Employment rules

These apply to every agent on the roster, in both groups.

- **No agent touches prod or any irreversible boundary.** Human-triggered only.
- **No agent grades its own homework.** The Fixer may edit app code, never the
  tests.
- **Every agent action lands as a reviewable record** — a commit for Dev, an
  audit log for Ops. If it cannot be audited after the fact, it is not an agent;
  it is a rumour.
- **Bounded retries, then escalate.** An agent that loops is a broken agent.
- **Allowlist, not judgment.** Where an agent has abilities, they are an explicit
  enumerated list. Anything not on the list escalates. The moment an agent decides
  *whether* an action is low-risk, it is grading its own homework.

---

## 4. Structure: lanes → squads → groups

Three levels, and they are not interchangeable.

**Lane** (company org, from the Harbour). The Dev and Ops groups sit entirely in
the **Product** lane. The Growth group spans **Marketing** and **Sales & Support**.
**Business Foundation still has zero agents** — and until Growth is actually
staffed, the gauge measures *engineering* leverage only. The neglect detector is
telling the truth.

**Squad** (per arc, disposable). A squad forms around a piece of work — the QA
pipeline, the multi-household spine, the OurKeep launch — and pulls whichever
agents it needs from both groups. Squads are DevOps by construction: they are not
Dev teams handing tickets to Ops teams.

**Group** (permanent taxonomy: Dev or Ops). Grouping is by **operating rules**,
not reporting line. Agents are grouped so their constraints stay coherent.

| | Dev | Ops | Growth |
|---|---|---|---|
| Triggered by | the founder | the world | the market / the user |
| Clock | session-time | wall-time | campaign & cohort time |
| Blast radius | pre-prod only | prod-adjacent | **reaches real humans, in public** |

Dev agents may be aggressive — a bad one costs a session. Ops agents must be
conservative: read-only by default, human at every irreversible boundary, and a
**heartbeat**, because a silent Ops agent is indistinguishable from a healthy
system.

Growth agents carry a third kind of risk and therefore their own rule:

> **No Growth agent addresses a human unsupervised. Draft, never send.**

A bad Dev agent costs a session. A bad Ops agent costs uptime. A bad Growth agent
says something wrong to a real user, in the founder's name, and it cannot be taken
back. This is the Growth group's equivalent of "no agent touches prod."

**Growth spans two lanes, not one.** Acquisition work sits in Marketing; support
and feedback sit in Sales & Support. The group is a taxonomy of operating rules;
the lane is the company org. Stated here so the Harbour's per-lane agent counts
are not surprised by a group whose members land in two different lanes.

A capability can be grouped Ops while serving a Dev workflow (the Inspector's
Part A checks read prod inside a merge gate). Grouping tells you *which rules
apply to that check*, nothing more.

**File by blast radius, not by where the work starts.** Migrations are authored in
Dev sessions but applied to prod — Migrator is therefore **Ops**. This keeps
"but I wrote it in a dev session" from ever becoming an argument for loosening the
prod boundary.

If a squad needs a rule its group does not grant, that is a signal to **amend the
group rules deliberately, in this file** — never to grant a quiet squad-level
exception.

---

## 5. Fleet vs. app: how the crew scales

**Charters are fleet-level. Instances are app-level.**

- **Shared across the fleet:** Scribe, Inspector, Watchman. Their jobs are
  structural, not product-specific — merge a handoff, run static checks, read
  user-visible failure signals. One charter, many deployments.
- **Per-app instances:** Tester, and later Fixer and Analyst. What "correct" means
  is entirely app-specific; OurProvisions' multi-household RLS matrix has nothing
  to say about OurKeep's fairness ledger. Same job description, different suite.

Improving a shared charter improves every app's instance. **This is the platform-
economics justification, not "find the current"** — the two are kept separate on
purpose (see DECISIONS LOG, 2026-06-xx). Agents are infrastructure; they earn
their place on shared-cost grounds, never on behavioural attachment.

---

## 6. The roster

### Dev group

**Inspector — Agent #1 (in promotion)**
Run deterministic checks against the repo; report pass/fail.
*Trigger:* pre-merge (`dev→main`), and on commit for static checks.
*Output:* green/red with named failures.
*Scope:* starts as harness **Part C** (static repo checks — no DB, no secrets,
runnable today). **Part A** (read-only prod queries) folds in later, behind
Bitwarden, and is Ops-grouped when it does.
*Promotes when:* Claude Code runs Part C end-to-end unattended and the result
blocks a merge without a human deciding anything.
*Hired first deliberately:* the first hire is the one who checks the others' work.
Every later agent is only safe to employ because this one exists.

**Scribe — Seat**
Merge `design_handoff.md` into the canonical docs, verified.
*Status:* fully specified and proven. Everything except transport.
*Promotes when:* the handoff reaches `docs/` without a human carrying it **and**
the Inspector can catch a corrupted merge.
*Blocked by:* Bitwarden; Inspector.
*Note the ordering* — Stage 1 depends on Stage 0. Automating Scribe's transport
before the gate can catch a bad merge would remove the only thing keeping session
history honest.

**Tester — Seat (spec'd, unstaffed)**
Run the QA suite; report failures; fix nothing. (Pipeline Stage 2.)
*Promotes when:* a full run completes unattended and its report is trustworthy
enough that the founder stops re-running it by hand.
*Instance per app.*

**Fixer — Charter only. Do not build.**
Bounded QA↔Code repair loop. Edits app code, **never** the tests. (Stage 3.)
Deliberately left unimplemented: it is the first Dev seat where a bad hire causes
real damage, and it cannot be graded until the Tester is proven.

### Ops group

**Watchman — Charter**
Read the instruments; fire on **user-visible failure**; heartbeat.
*Instruments:* Splunk Synthetics (Data API), RUM JS errors, 522s. Instruments are
equipment — they do not count toward the gauge.
*Rule inherited from the July outage:* detectors go where the user lives.
Infrastructure metrics screamed and were wrong; the user-visible signals were
quiet, unwatched, and exactly right.
*Heartbeat requirement:* Watchman must periodically prove it is alive. If it goes
silent longer than its interval, **that itself escalates** — otherwise a dead
Watchman looks exactly like a quiet week.
*Hands:* none.

**Analyst L1 — Charter (staff last)**
Assemble the diagnostic brief; attempt a bounded set of named **restore** actions;
log every attempt; escalate.

> **Restore ≠ repair.** Restore returns the system to a known-good state and is
> reversible: restart a stuck worker, clear a cache, re-run a failed job, flip a
> feature flag off. Repair is the irreversible boundary: edit config, change
> schema, deploy, touch data. **L1 gets the first list, never the second.**

*Constraints:* allowlist only — an unrecognised signal escalates immediately and
never improvises. **One attempt, then escalate** — no retry loops against a system
it cannot see. Every action is a reviewable record.
*Staffing order:* charter now, staff **last**. This is the highest-risk hire on
the roster, it is Ops-grouped (fires when the founder is least able to intervene),
and an L1 acting on a false alarm is strictly worse than no L1. Watchman's signals
must be proven trustworthy first.

**Analyst L2 — human**
The escalation target. Works with the Dev group to resolve. Today this is the
founder; the charter names the **role**, not the person.

**Migrator — parked (name reserved, no charter)**
Supabase CLI migration workflow. Prod `db push` stays human-triggered, always.
Ops-grouped by blast radius. Blocked by: migrations-folder reconciliation,
Bitwarden.

### Growth group

The founding pattern is being found on OurProvisions, but these are **fleet
charters**. A squad activates them for an app; the instruments, ladder
definitions, and taxonomies become app-specific at that point.

**Scale caution — do not automate the founder conversations.** At a ten-user beta,
answering questions personally is not overhead; it is the highest-signal research
available, and it is what produces the "we heard you" nurture beats. An agent that
handles support at n=10 automates away the conversations that tell you what the
next app should be. In every charter below, **the agent takes the deterministic
observation; the human keeps the judgment and the human contact.**

**Funnel Inspector — Charter (Marketing lane)**
Report which users sit at which rung of the activation ladder (R1 in-the-door →
R2 invite pivot → R3 the aha → R4 it's-mine → R5 come-back). Observation only;
it does not act, nudge, or address anyone.
*Instruments:* Splunk RUM + Digital Experience Analytics custom telemetry
(behaviour), Supabase (outcomes), and in-product surveys (stated intent, future).

> **Behaviour comes from telemetry; outcomes come from the database.**
> Telemetry is sampled, best-effort, and blockable. The database is authoritative.
> **Never compute the depth metric (the invite pivot) from RUM** — R2 completing
> means a second person *joined*, which lives in `household_members` and the invite
> seam, not in a client beacon. Where the two disagree, the database wins and the
> telemetry gap is a defect to file.

*Blocked by:* the **event taxonomy** — a small, closed, named set of ladder events
that every app implements identically. Get it wrong and each app's funnel data is
incomparable, which defeats the fleet-charter model entirely. Cheap now, expensive
later.

**Feedback Scribe — Charter (Sales & Support lane)**
Capture, tag, and surface patterns in what users say. Stands in the same relation
to support conversations that Scribe stands in to sessions: **the founder does the
talking; the agent stops the signal evaporating.** Tagging taxonomy is per-app.

**Copy Drafter — Charter (Marketing lane), low priority**
Produce copy candidates for the founder to edit. Never publishes.
*Honest assessment:* the weakest of the three. At this stage the founder's voice
is the product and drafting is not the bottleneck. Chartered for completeness, not
because it is wanted.

**In-product surveys — instrument, with a constraint**
Surveys are the one Growth instrument that **addresses a human**, so they cross the
group's own rule. Charter them as: *triggered* by the Funnel Inspector, *authored*
by the founder, *fired* on an allowlist of named moments. Never composed on the
fly. This is the Analyst L1 restore-vs-repair discipline applied to attention
instead of infrastructure.

---

## 7. Escalation & on-call

Two tiers. The channel matters less than the threshold.

**Wake me — SMS.** The app is down or unusable for real users, and Analyst L1
either could not restore it or was not permitted to try. This must fire rarely
enough that an SMS is assumed real and acted on.
*Why SMS:* it rides the cell network, not the internet. A push notification needs
working data; the boat and the lake do not reliably have it.

**Tell me — email digest.** Everything else: a successful L1 restore, a single
non-recurring error, a heartbeat miss that self-resolved. Batched; read with
coffee.

**On-call** is a **role**, not a person. It currently resolves to one human. It is
written as a role so the 24×7 version of this company does not require a rewrite.

*Mechanics (build detail, not a decision):* Twilio, or a carrier email-to-SMS
gateway as a zero-cost interim.

---

## 8. Why the rules make the number smaller

Three rules in this document deliberately reduce the leverage gauge:

1. **C-suite Claude projects are excluded** (2026-06-11) — they are advice, not
   agents.
2. **Instruments are equipment, not crew** (2026-08-05) — detectors do not count.
3. **Rituals and Seats count zero**, not partial credit.

Each was adopted while the number was purely internal and there was nothing to
gain by shrinking it. The moment the ratio becomes external positioning, the
incentive to inflate arrives. **The rubric is the moat, not the ratio** — a 1:20
claim is only worth making if the definition survives an audit.

At 30 employees, 1:20 means ~600 tasks running with no human between their steps.
Every one needs a heartbeat, a failure mode, and someone who notices when it goes
quiet. That is tractable only with narrow charters, binary counting, and no
self-grading. These rules are not modesty; they are what makes the claim
operable at scale.

Lead with **profit per employee**, not the ratio alone. The ratio invites "so you
have fewer people." Profit per employee makes it a quality claim — and it is the
number that is hardest to fake.

---

## 9. Open items

- **Ladder event taxonomy is undefined** — gates the Funnel Inspector, and gates it
  fleet-wide, not just for OurProvisions. The highest-leverage open item here.
- Watchman's instrument thresholds (what constitutes "user-visible failure") are
  not yet numeric.
- Analyst L1's restore allowlist is not yet enumerated.
- Feedback Scribe's tagging taxonomy is undefined (per-app, but wants a shared
  shape).
- Business Foundation lane has no agents and no charters.
- Bitwarden remains a **blocker** for automation past pipeline Stage 0.
- **Roster shape will strain at app #2.** The roster below is prose referencing
  OurProvisions-specific artifacts (harness Parts A/C, the migrations debt). With
  a second app it wants a per-app instance table. Do not build it early — just do
  not be surprised.
