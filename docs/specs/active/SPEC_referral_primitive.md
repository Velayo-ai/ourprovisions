# SPEC — Referral primitive (`?ref=` link + attribution)

**Status:** Ready to build. Migration 021 + client. Design settled 2026-07-16.
**Scope:** OurProvisions. A share action that invites someone to **the app**, not to a household.

---

## Why this exists (it is not "spread the word")

Two reasons, in order of weight:

1. **Hand-composed links are a defect surface.** Dan texted Heddi a bare
   `ourprovisions.velayo.ai` (no scheme). Her Android threw *"Could not find an
   appropriate application"* — an unresolvable intent. She recovered by typing the
   URL into Chrome. Chris later received a link **from inside the app** (Web Share,
   `https://` + prose) on Android, also rendered as a rich card, and it worked.
   The app-composed artifact is well-formed by construction; a human at midnight
   is not. **Owning the artifact is the fix**, exactly as the household invite
   already does.
2. **There was no correct tool for the job.** The only working front door today is
   the *household invite* — which grants membership and write access. Inviting
   someone to try the app meant either adding them to your household (wrong) or
   pasting a raw URL (what happened). Referral is the missing primitive.

**Per DECISIONS 2026-07-14:** invite = authorization (token, membership, write
access); referral = advocacy (no grant, no token). This spec builds the second.

---

## Heddi diagnosis — CORRECTED, and now UNRESOLVED

The 2026-07-14 session concluded her failure was **RCS rich-card intent
resolution**. **That conclusion does not survive new evidence** surfaced 2026-07-16:
Chris received a carded link on Android and it worked. Card + tap is therefore not
sufficient to cause the failure.

Remaining uncontrolled difference, and the leading hypothesis: **Dan's link was
schemeless** (`ourprovisions.velayo.ai`); the in-app invite carries `https://`.
A schemeless string may resolve to no intent handler. *Unproven* — Messages
usually auto-linkifies.

**Open, cheap test (5 min, not blocking this build):** text an Android phone
`ourprovisions.velayo.ai` and `https://ourprovisions.velayo.ai`; tap both.

**Standing correction:** the original diagnosis was reasoned from one screenshot
with no control, and read as airtight only because nothing contradicted it. n=1.
This build is correct regardless of the outcome — it removes the hand-composed
link either way.

---

## Decisions baked in

| decision | rationale |
|---|---|
| **Placement: Preferences sheet**, NOT the household share sheet | Different layers. Invite is household-scoped ("this list, these people"); referral is app-scoped. Co-locating forces users to notice a distinction they don't care about **at the exact moment we want the harder action** — and "just tell them about the app" is easier than "share my list," so it cannibalizes the depth metric (≥50% of beta users must invite a second person; the invite is the ONLY path to the aha). |
| **No counters, no gamification, no leaderboard** | Referral volume rewards blasting the link at everyone; a user who refers one spouse produces the entire CI thesis, a user who refers 20 acquaintances produces nothing. Gamification would rank the second above the first. Contradicts the locked metric's own warning that *breadth without depth is a false pass*. Rewards stay Phase 4 per DECISIONS 2026-07-14. |
| **Do NOT track sends** | `navigator.share` hands off to the OS and reports nothing — a "send" is unobservable; only *intent* (the tap) is knowable, which overcounts every cancel. Dividing conversions by intents yields a rate that looks terrible and means nothing. Dropped by Dan's call: count successful signups only. Removes a table, a counter, and a misleading ratio. |
| **Success = a `users` row exists with `referred_by` set** | The schema picks the honest definition: a `users` row only exists if they cleared Clerk **and** bootstrapped into our system. Counting Clerk accounts would count ghosts — Aidan created an account and never arrived. |
| **`referred_by` IS the metric** | `select count(*) from users where referred_by = <id>`. No counter column to drift, no separate table, no maintenance. Attribution and measurement are the same row. |
| **Trigger-generation of `referral_code`** (not lazy) | The column is cheap and every user should have a stable code. Unlike the lazy-invite precedent (Option B, 2026-07-10) — which existed to keep `household_invites` free of inert self-expiring rows — there is no junk-row problem here: a code is an attribute, not an artifact. |
| **`sessionStorage` for code survival** | Mirrors the proven `pending_invite_code` pattern exactly: Clerk's sign-up redirect strips URL params for brand-new users, so the code must be captured at app entry and read back after bootstrap. |
| **Copy is a default, not a script** | Web Share drops text into the sender's messaging app, where they can rewrite it. Lowers the stakes on perfect wording. |

---

## Copy (settled by walking the Dan → Glen → Jason chain)

**Share message:**
```
Check out OurProvisions — a grocery list you share with your household that
gets smarter as you use it. https://ourprovisions.velayo.ai/?ref=DAN4K2
```

Rejected, with reasons — the trail matters, since copy drifts back:

- ❌ *"best shopping list app ever built"* — fights the whole positioning (living list,
  harbour, brown paper, farmers-market-not-superstore). Superlatives are the voice of
  a company with nothing else to say; a claim invites argument, and nobody forwards a boast.
  Also concedes the smallest frame — OurProvisions is the door into the harbour, not a list app.
- ❌ *"join the fleet"* — wrong noun. **Fleet = the apps. Harbour = the shared identity
  layer. Crew = people on a trip.** "Join the fleet" invites your friend to become an app.
  Users **come aboard**.
- ❌ *"we are building…"* — the sharer is the *user*, not Velayo. "We" puts the company's
  words in their mouth; that is precisely what makes it read as marketing.
- ❌ *"help your friends live healthier, happier, earth-kind lives"* — the mission is the
  reason **Dan builds**, not the reason **Glen shares**. Delivered from a Preferences
  drawer for a grocery list, the gap between the ask (text a link) and the claim
  (improve a life) reads as marketing. **The mission belongs on the landing page**
  (Boardroom → Trough → Ah-ha → Vision → Front Door), where a stranger arrives with no context.
- ❌ *"I am inviting you to check out"* — stiff; nobody types it. Also collides with the
  household-invite vocabulary, where "invite" is a real token-bearing grant. Two meanings
  of *invite* is how users misunderstand what they accepted.
- ❌ *"new grocery app"* — hands Jason the smallest frame and invites *"I already use Notes."*

**Why the chosen line works:** Glen isn't relaying Velayo's pitch — he's making his
own recommendation. The endorsement IS Glen; the link is just the artifact, and the
copy is only the frame around it. `"share with your household"` does the
differentiating work that `"new app"` cannot, mirroring how the household invite's
`"we'll share it and it gets smarter"` names the actual difference.

**Button label:** ⚠️ UNSETTLED. "Share OurProvisions" is the placeholder. Note the
live tension: a bare line in Preferences reads as a shrug — Preferences is the utility
drawer (prices toggle, text size, sign out) — and a counter next to it would be worse
(a scoreboard for a game the user never agreed to play). Referral has **no payoff for
the sender**: invite gives you a shared list; referral gives you… your friend has an app.
Any placement will read a little like a shrug until the landing page gives it a reason
to point at. Resolve at build or in the nav/affordances session.

---

## Migration 021

```sql
-- 021_referral_primitive.sql
alter table users add column referral_code text unique;
alter table users add column referred_by uuid references users(id);
```

**Code format:** reuse the `household_invites` generator (proven in prod, e.g. `DE39W9`)
— 6 chars, alphanumeric. Do not invent a second format or re-reason about collisions.

**Backfill:** existing users need codes. Generate for all rows where
`referral_code is null`.

**Trigger:** set `referral_code` on user creation. ⚠️ Users are created inside
`bootstrap_new_user` (SECURITY DEFINER) — decide at build whether the code is set by a
DB trigger on `users` or inside that RPC. **A trigger is safer**: it cannot be bypassed
by a future insert path.

### Open at build

- **Case sensitivity.** `DAN4K2` in a URL — if retyped lowercase, does it match?
  Store normalized or compare case-insensitively. The normalization contract
  (`lower(trim(regexp_replace(name,'\s+',' ','g')))`) has opinions; codes are not names,
  so decide deliberately rather than inheriting.
- **Self-referral.** Nothing stops `referred_by = self` if a user opens their own link.
  Guard in the RPC.
- **RLS.** `referral_code` is readable by its owner (they must see/share it).
  `referred_by` is founder telemetry — decide whether users may read who referred them.
- **`users` is household-joined via RLS.** Confirm the new columns don't widen any
  existing policy's exposure.

---

## Client wiring

**1. Capture at entry** — beside the existing `pending_invite_code` setter:

```js
const ref = new URLSearchParams(window.location.search).get("ref");
if (ref) sessionStorage.setItem("pending_ref_code", ref);
```

⚠️ **grep-before-edit.** The project mirror's `index.js` shows neither the setter nor a
real Clerk key (it carries a hardcoded `pk_test_…`), yet `useProvisions.js:277` reads
`pending_invite_code` from sessionStorage. **The mirror is stale.** Find the live setter
and put the referral capture beside it — do not author a new capture point from this spec.

**2. Consume at bootstrap** — `useProvisions.js` ~line 277, mirroring the invite path:

```js
const urlRef = new URLSearchParams(window.location.search).get("ref");
const pendingRefCode = urlRef || sessionStorage.getItem("pending_ref_code");
```

Pass `p_ref_code` to `bootstrap_new_user`; the RPC resolves the code → `users.id` and
sets `referred_by`. **One atomic transaction, same as the invite join.**

Clear `pending_ref_code` after the bootstrap attempt regardless of outcome — same
rationale as the invite code's comment: *"Code has been attempted — clear the persisted
copy so it can't re-trigger on a future visit."*

⚠️ `bootstrap_new_user` signature changes → **SECURITY DEFINER RPC edit**. Verify the
save with `prosrc`, not `pg_get_functiondef` (the SQL editor's `LIMIT 100` truncates it):

```sql
select proname, length(prosrc) as body_len,
       position('p_ref_code' in prosrc) > 0 as has_feature
from pg_proc where proname = 'bootstrap_new_user';
```

**3. Share action** — Preferences sheet. Reuse the `navigator.share` plumbing from the
invite flow (`8c62315`): feature-detected, **Copy is the fallback and the sole action
where Share is absent**. Not UA-sniffed (DECISIONS 2026-07-10).

---

## What this does NOT fix

**Jason still lands on Clerk sign-up with no explanation.** Nothing tells him what
OurProvisions is, why Glen sent it, or that it's a web app rather than a download —
which is *exactly* how Aidan failed ("I thought I needed to download it"). Glen's
endorsement — the whole reason Jason clicked — evaporates at the door.

Good copy delivers him to a closed door faster.

**The referral is FOR the landing page.** All launch assets remain DESIGNED but
UNWRITTEN (sign-up page, questionnaire copy, welcome email) — the 2026-07-10
Next-session goal, skipped across five subsequent build sessions. This spec is
worth shipping anyway (it removes the hand-composed-link defect and costs a
migration), **but it will not move the CI activation metric until the door exists.**

---

## Verification

| # | Test | Pass |
|---|---|---|
| 1 | New user signs up via `/?ref=<code>` | `users.referred_by` = referrer's id |
| 2 | Same, but Clerk strips the param on redirect | Still attributed (sessionStorage held it) |
| 3 | Existing user opens a `?ref=` link | No attribution written; no error |
| 4 | User opens their **own** ref link | No self-referral row |
| 5 | Signup with **no** `?ref=` | `referred_by` null; bootstrap unaffected (regression) |
| 6 | Share from Preferences on a real phone | OS share sheet opens, message pre-written, link carries `https://` + code |
| 7 | Share where `navigator.share` is absent | Copy fallback is the sole action |
| 8 | Backfill | Zero `users` rows with null `referral_code` |

Test 5 is the regression guard — `bootstrap_new_user` is the hot path for **every**
user; a signature change that breaks the no-ref case breaks all signup.

**Staged deploy:** dev-verify → prod. Hard-refresh before judging.
