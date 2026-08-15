# Velayo OS — Agents

*Last updated: 2026-08-15 (+ **THE LADDER IS REPLACED, NOT AMENDED** [Velayo OS]. §1's Ritual/Seat/Agent definitions are superseded wholesale by the 2026-08-15 design session: tier now turns on **autonomous trigger + judgment + independent observation surface — all three** — not on documentation or on the old gate-vs-assembly-line promotion line, which is **withdrawn**. Two new rules do most of the work: **fan-out is part of the same Seat** (tier is a property of the chain's root trigger, not of each link) and **a Seat put on a schedule is still a Seat**. New build constraint: **watchers stand alone from day one** — never grafted inside a Seat's script — so promotion is a config change, not a rewrite. **Roster re-verified, not just re-worded: Inspector DEMOTED from "Agent #1 (in promotion)" to Seat** (deterministic pass/fail = no judgment; wired into `dev→main` = no observation surface), and **Watchman is now the strongest Agent candidate** (clears all three). **Tester's old status as the ladder's worked example of an agent is false under the new test.** **Fixer is structurally barred** as a pipeline stage. **Analyst L1 RULED an Agent** — selecting a restore from a named list on observed conditions **is** judgment; it remains Charter-tier, unbuilt, staffed last (classification, not build order). Two knock-on reconciliations applied the same day: **§2's counting rule now carries §1's three conditions verbatim** (it previously counted any task completing "with no human between its steps," which a scheduled Seat satisfies — a task counts only if the job doing it is an Agent), and **§3's "Allowlist, not judgment" is reworded to "Allowlist-constrained judgment"** — bounded choice *is* judgment; the rule gates what an agent may do, not whether choosing counts. **Content Loop's Watcher renamed → `Content_Idea`** (Watchman unchanged). Net gauge effect **zero** (Inspector was in promotion, never promoted) — but the Dev group now has **no Agent candidate**, and the Agent tier turns out to live in **Ops and Growth**, where the roles are observers rather than steps in a chain. Prior 2026-08-05 (created — the ladder, promotion line, counting rule, employment rules, the **Dev / Ops / Growth** grouping, and the founding roster.)*

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

> **Definitions replaced 2026-08-15** (Velayo OS design session). This **supersedes
> the 2026-08-05 ladder entirely** — it is not a second view held alongside it. The
> prior version keyed Ritual on being *undocumented* and Seat on having a *written
> job description*; tier now turns on **trigger, judgment, and observation surface**.
> The old promotion line ("the human may stand at the gate, but not on the assembly
> line") and its worked examples are withdrawn with it. Where a roster entry's tier
> or reasoning changed, §6 says so explicitly.

A job is promoted through three tiers. It is never assumed into one.

| Tier | Definition | Counts toward gauge |
|---|---|---|
| **Ritual** | A task performed by a human. No tool involved. | No |
| **Seat** | A tool, triggered by a human. | No |
| **Agent** | Autonomous trigger **+** judgment **+** an independent observation surface. **All three.** | Yes |

The Seat tier is still the same principle the Harbour applies to lanes: **the
charter exists before the headcount.**

### Seat — the fan-out rule

Everything a tool fans out into internally is **still part of that same Seat**,
regardless of how many steps or sub-tools it chains through. **Tier is a property
of the whole chain's root trigger, not of each link.** A Seat that invokes five
sub-tools is one Seat, not five agents.

> **A Seat put on a schedule is still a Seat.** Removing the keystroke does not add
> judgment.

This is the rule that does the most work, because it is the one an optimistic
reading of the gauge will try to route around.

### Agent — all three conditions, not just one

1. **Autonomous trigger** — it does not need a human to initiate.
2. **Judgment** — it decides the correct action from observed conditions, rather
   than executing a fixed, predetermined sequence.
3. **Independent observation surface** — it stands apart from any single Seat's or
   Agent's execution, watching output(s) — from a Seat, another Agent, or a human
   directly — rather than being wired in as a synchronous internal step of one of
   them.

A job holding one or two of these is a **Seat**. In particular, deterministic
pass/fail work is never an Agent no matter how it is triggered: with no judgment,
an unattended trigger only makes it a scheduled Seat.

**Human gates do not change tier.** A hard-coded human checkpoint stays human at
every tier; it constrains what a job may *do*, not what the job *is*.

### Build constraint: watchers stand alone from day one

**Build Content_Idea — and every future Agent candidate — as a standalone watcher
with its own read access from day one. Never graft one on as a step inside a Seat's
script**, even while it is still human-triggered.

A watcher wired into a Seat's script fails condition 3 **structurally**, and no
amount of later scheduling repairs it — it would need a rewrite. Built standalone,
promotion to true Agent is a **config change**: remove the keystroke gate. Nothing
else moves.

Content_Idea (the Content Loop role designed 2026-08-15) already satisfies
**judgment** and **independent observation**. The only missing piece for Agent tier
is the **autonomous trigger**.

### Employment prerequisites (retained — these are not tier tests)

The 2026-08-05 list of "four qualifying conditions" is **not** the tier test and is
no substitute for the three conditions above. Three of the four survive as
**prerequisites for employing** an agent, enforced in §3:

- A job description narrow enough to **fail visibly**.
- An output another system can **verify deterministically**.
- A **bounded blast radius** — it cannot reach prod or any irreversible boundary
  without a human.

The fourth — *"a trigger it can act on with no human between its own steps"* — is
**superseded** by the autonomous-trigger criterion, which is stricter.

---

## 2. The counting rule

The gauge counts **tasks, not seats**. A task counts when it:

1. Would otherwise require a human,
2. Runs on an **autonomous trigger** — no human initiates it,
3. Applies **judgment** — it decides the correct action from observed conditions
   rather than executing a fixed, predetermined sequence,
4. Stands on an **independent observation surface** — it is not a synchronous
   internal step of some other job, and
5. Emits a signal that can be checked.

**Binary. No partial credit. No fractions. No "mostly automated."**

Rituals and Seats count **zero**, not partial credit.

> **Corrected 2026-08-15.** The rule previously counted any task that *"completes
> with no human between its steps"* — which a **scheduled Seat** satisfies, putting
> §2 in direct conflict with §1 and with this section's own "Seats count zero" line.
> Under the 2026-08-05 ladder there was no conflict, because running unattended
> *was* the promotion test. It no longer is. Criteria 2–4 are now **§1's three Agent
> conditions verbatim**, so the counting rule and the ladder cannot drift apart:
> **a task counts only if the job doing it is an Agent.**

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
- **Allowlist-constrained judgment.** Where an agent has abilities, they are an
  explicit enumerated list. Anything not on the list escalates. An agent may
  **choose among the bounded options on its list** using observed conditions — that
  is judgment, and it counts as judgment under §1. What it may never do is decide
  *whether a new action belongs on the list*, or rule an unlisted action low-risk;
  that is grading its own homework.

  > **Reworded 2026-08-15.** This rule was previously *"Allowlist, not judgment,"*
  > which read as denying that bounded choice is judgment at all — putting §3 in
  > tension with §1 the same way §2 was, and (per the same day's ruling) barring
  > **Analyst L1** from the Agent tier it in fact qualifies for. The rule's real job
  > is to **gate what an agent may do, not to define away the choosing.** Scope
  > narrowed, strictness unchanged: the allowlist is still closed, and unrecognised
  > signals still escalate.

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

### Re-verification against the 2026-08-15 ladder

Every role below was re-tested against **trigger + judgment + observation surface**,
not merely re-worded. Two results are load-bearing: **Inspector loses Agent #1**,
and **Watchman becomes the roster's strongest Agent candidate.**

| Role | Tier before | Tier now | Trigger | Judgment | Obs. surface |
|---|---|---|---|---|---|
| **Inspector** | Agent #1 (in promotion) | **Seat** ⬇ | partial | **no** | **no** |
| **Scribe** | Seat | Seat *(new reasoning)* | no | yes | no |
| **Tester** | Seat | Seat *(new reasoning)* | no | **no** | **no** |
| **Fixer** | Charter only | Charter — **structurally barred** | no | yes | **no** |
| **Watchman** | Charter | Charter — **clears all three** ⬆ | yes | yes | yes |
| **Analyst L1** | Charter | Charter — **qualifies as Agent** ⬆ | yes | yes | yes |
| **Migrator** | parked | parked — Seat by design | no | — | — |
| **Funnel Inspector** | Charter | Charter — unresolved ⚠ | unspecified | *disputed* | yes |
| **Feedback Scribe** | Charter | Charter — unresolved ⚠ | unspecified | yes | yes |
| **Copy Drafter** | Charter | Charter — **Seat-shaped** | no | yes | no |

**Net effect on the gauge: zero, and it was already zero.** Inspector was *in*
promotion, never promoted, so no counted agent-task is lost. But the Dev group now
has **no Agent candidate at all**, which the previous ladder concealed.

**Where the Agent tier actually lives now: Ops and Growth, not Dev.** The three roles
that qualify or nearly qualify — Watchman, Analyst L1, and Content_Idea — are all
*observers* by construction. The Dev roles are all *steps in a chain*, and steps in a
chain fail condition 3 no matter how well they are built. That is a finding about the
shape of the work, not about the quality of the charters.

### Dev group

**Inspector — Seat** *(demoted 2026-08-15 from "Agent #1 (in promotion)")*
Run deterministic checks against the repo; report pass/fail.
*Trigger:* pre-merge (`dev→main`), and on commit for static checks.
*Output:* green/red with named failures.
*Scope:* unchanged — starts as harness **Part C** (static repo checks — no DB, no
secrets, runnable today). **Part A** (read-only prod queries) folds in later, behind
Bitwarden, and is Ops-grouped when it does.
*Why it is a Seat under the 2026-08-15 ladder:* it **fails judgment** — "run
deterministic checks, report pass/fail" is a fixed, predetermined sequence *by
design*, and that determinism is the point of the role, not a gap to be closed. It
also **fails the independent observation surface**: it is wired into the `dev→main`
chain as a synchronous gate step. Its old promotion criterion — *"runs Part C
unattended and blocks a merge without a human deciding anything"* — would satisfy
the **autonomous trigger alone**, and one of three is a Seat. **Putting it on a
commit hook does not promote it**; that is the schedule rule.
*Consequence:* Inspector is still the correct **first hire** — the checker that
makes every later hire safe to employ — but it counts **zero** toward the gauge, and
the Dev group has no Agent candidate behind it.
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
*Tier under the 2026-08-15 ladder:* **Seat — unchanged, but for a different reason.**
The old ladder called it a Seat because *a human is its transport layer*; the new
test does not weigh transport at all. It is a Seat because a human types SESSION END
— it **fails the autonomous trigger**, and that alone settles it. Its fan-out across
many steps and sub-tools does not make it more than one Seat.

**Tester — Seat (spec'd, unstaffed)**
Run the QA suite; report failures; fix nothing. (Pipeline Stage 2.)
*Promotes when:* a full run completes unattended and its report is trustworthy
enough that the founder stops re-running it by hand.
*Instance per app.*
*Tier under the 2026-08-15 ladder:* **Seat — unchanged in tier, withdrawn in
reasoning.** The superseded ladder used this exact role as its worked example of an
agent: *"a Tester that reports failures without fixing them **is** an agent."* **That
claim is now false.** Running a suite and reporting is a fixed sequence with no
judgment, wired into the pipeline as Stage 2. It is a Seat however it is triggered,
and the "promotes when" line above now describes a **scheduled Seat**, not a
promotion.

**Fixer — Charter only. Do not build.**
Bounded QA↔Code repair loop. Edits app code, **never** the tests. (Stage 3.)
Deliberately left unimplemented: it is the first Dev seat where a bad hire causes
real damage, and it cannot be graded until the Tester is proven.
*Tier under the 2026-08-15 ladder:* **structurally barred from Agent tier as
chartered.** It has judgment (it decides repairs from observed failures) but no
autonomous trigger, and as **pipeline Stage 3** — a synchronous step downstream of
Tester — it fails the independent observation surface *by construction, not by
accident*. If Fixer is ever wanted at Agent tier it must be re-chartered as a
**standalone watcher of test output** per §1's build constraint, not as a pipeline
stage. Otherwise unchanged: **do not build.**

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
*Tier under the 2026-08-15 ladder:* **the roster's strongest Agent candidate — it
clears all three.** *Autonomous trigger:* it watches continuously, and the heartbeat
requirement already presumes it runs unbidden. *Judgment:* it decides whether an
observed signal constitutes user-visible failure. *Independent observation surface:*
it is definitionally apart from what it watches — it reads instruments and is wired
into nothing. Still **Charter** tier because it is **unbuilt**, not because it is
undecided. **Build it standalone** per §1's build constraint; a Watchman grafted
into any other job's script would forfeit condition 3 permanently.

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
*Tier under the 2026-08-15 ladder:* **Agent — ruled 2026-08-15.** It clears the
**autonomous trigger** (Watchman's escalation initiates it; no human), the
**independent observation surface** (it stands downstream of Watchman, not inside
it), and — per the ruling — **judgment**: *selecting a restore action from a named
list, on observed conditions, is judgment.* Bounded choice is still choice. §3's
employment rule was reworded the same day to match; it now gates **what** an agent
may do, not whether choosing among bounded options counts.

> **Classification only.** This ruling does not touch build order or caution.
> Analyst L1 remains **Charter tier, unbuilt, staffed last** — the highest-risk hire
> on the roster, gated behind Watchman's signals being proven trustworthy. It is the
> first role to *qualify* as an Agent; it will be the last one built. Those are
> different statements and the distance between them is deliberate.

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
4. **Fan-out is one Seat, and scheduling does not promote** (2026-08-15) — a tool
   that chains through twenty sub-steps is one Seat, and putting it on a timer adds
   no judgment. This is the largest single reduction of the four: it forecloses the
   two most available ways to inflate the number, and it is what demoted Inspector.

Each was adopted while the number was purely internal and there was nothing to
gain by shrinking it. The moment the ratio becomes external positioning, the
incentive to inflate arrives. **The rubric is the moat, not the ratio** — a 1:20
claim is only worth making if the definition survives an audit.

At 30 employees, 1:20 means ~600 tasks running on their own triggers, exercising
judgment, each standing on its own observation surface.
Every one needs a heartbeat, a failure mode, and someone who notices when it goes
quiet. That is tractable only with narrow charters, binary counting, and no
self-grading. These rules are not modesty; they are what makes the claim
operable at scale.

Lead with **profit per employee**, not the ratio alone. The ratio invites "so you
have fewer people." Profit per employee makes it a quality claim — and it is the
number that is hardest to fake.

---

## 9. Open items

- **Several "promotes when" lines are stale** — Scribe's and Tester's both describe
  removing the human, which under the new test yields a scheduled Seat, not an Agent.
  They need rewriting against all three conditions, not just trigger.
- **Three Growth charters are unresolved on trigger** — Funnel Inspector, Feedback
  Scribe and Copy Drafter were written before the new test and none names a trigger.
  Funnel Inspector's judgment is also disputed (classifying users against a fixed
  taxonomy may be a predetermined sequence).
- **Content Loop role charters are not written** — Content_Idea, Editor and Publisher
  were designed 2026-08-15 but have no trigger/steps/output/verification blocks in
  this roster. Content_Idea is the fleet's nearest true Agent (missing only the
  autonomous trigger), so its charter is the one that matters most.
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
