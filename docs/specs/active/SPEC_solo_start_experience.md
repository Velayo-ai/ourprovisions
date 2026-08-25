# SPEC — Solo-start experience: naming sheet, invite recovery, two share verbs, referral carry

**Status:** ACTIVE — designed 2026-08-25, mockup approved (`mockup_solo_start_v2.html`)
**Scope:** OurProvisions. Client (`App.js`, `useProvisions.js`) + one migration (referral columns).
**Mockup of record:** `docs/mockups/mockup_solo_start_v2.html` (tiebreaker over this prose).
**Supersedes:** the *placement* decision of `SPEC_referral_primitive.md` (2026-07-16) — referral
surface moves from Preferences into the household sheet as **Share the app**. The July spec's
other two decisions stand unchanged: **measure `referred_by`, not sends**, and **no gamification**.

---

## 1. Why (the incident this designs away)

2026-08-24 triage: Prem received the **bare app URL with no `?invite=` code**, signed up, and
was silently enrolled as sole owner of a place named "My Household" — correct behavior that
*read* as broken. Root cause was signal design: one link served two intents ("join my list"
vs. "check out this app"), and the solo landing had no moment of orientation.

Fix thesis: **the naming moment IS the invite-recovery moment**, and **the two send intents
become two verbs with structurally different links.**

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | First-run **welcome sheet** fires once for bare-URL signups: name-your-place field + inline invite-code recovery. | Solo-start is a first-class designed path, not a fallback. |
| D2 | Copy: headline "What should we call your first place?", sub "Don't worry — you can rename it or add more places later." Place vocabulary throughout (July rename). | "first" foreshadows multi-place; the reassurance defuses naming paralysis, which is what makes a naming gate safe to have. |
| D3 | Sheet is **skippable** ("I'll do this later"); skip leaves the `"My Household"` sentinel; no re-fire, no nagging. Pencil-edit is the standing fallback. | Onboarding friction stays minimal; earned-Our + pencil already carry the later nudge. |
| D4 | **Continue disabled while the field is empty.** | Skip *is* the no-name path; an enabled empty Continue is a second Skip with a misleading label. |
| D5 | Invite-code recovery is an **inline expander on the same sheet** ("Already have an invite? Enter it here"), never a second screen. | The recovery must be present at the exact moment of mis-enrollment, with no flow to abandon. |
| D6 | Two share verbs in the household sheet: **Invite aboard** (primary, unchanged) and **Share the app** (secondary, subdued, new). No interstitial/confirm on either. | Labels + visual hierarchy carry the distinction; a confirm punishes the common case. If field evidence shows fat-fingering, fix spacing/styling, not a dialog. |
| D7 | **Share the app carries `?ref=CODE`, never `?invite=`.** `ref` **attributes but never enrolls** — recipient lands as a solo-start, sees the welcome sheet, names their own place. | Referral tree (Dan → Prem → Prem's friends) becomes a database fact with zero change to the recipient's experience. |
| D8 | Hard rule: **every in-app share path carries either `invite` or `ref` — never a naked URL.** A truly bare URL means organic/typed/marketing (`referred_by = null`). | Structural guarantee: a recipient either has a working invite or a knowing app recommendation — never the ambiguous middle that produced the incident. |
| D9 | Referral code is **one stable code per user**, minted at bootstrap (or lazily on first share — builder's choice). Invite codes stay per-share, expirable. Different species, never unified. | Invite grants membership and needs lifecycle; ref grants nothing and needs identity. |
| D10 | Share-the-app has **no DB write at send time** — attribution is written only when a signup arrives carrying the code. | July decision "measure arrivals, not sends" — arrivals are facts, sends are noise. |
| D11 | **Code-join from the welcome sheet soft-deletes the orphan solo place**, iff ALL FOUR: created this session by bootstrap ∧ name still the `"My Household"` sentinel ∧ zero list items ∧ caller is sole member. Cleanup runs ONLY at this moment — never in the background, never later. | **Naming is claiming.** We only delete a place nobody claimed — never named, never stocked, never shared, machine-created seconds ago. One item added, one name saved, or one member joined makes it theirs permanently. *(Confirmed by Dan 2026-08-25.)* |

## 3. Trigger mechanics (D1)

Mirrors the existing `just_joined_household` durable-flag pattern.

- **Set:** in `useProvisions` bootstrap, at the seam that distinguishes create-vs-join. When
  `bootstrap_new_user` **creates** (fresh solo place) rather than joins, write
  `sessionStorage.just_signed_up = "1"`.
- **Fire:** sheet renders iff ALL of: flag present ∧ no `?invite=` in URL ∧ active place
  name === `"My Household"` (the DB-default sentinel, `App.js:943` class).
- **Consume:** the flag burns on **any** exit — Continue, Skip, or successful code-join.
  Can never re-fire.
- **Safety net:** the sentinel check means a stray surviving flag on a named place stays
  silent. *Behavior before label, applied to a trigger.*

## 4. The welcome sheet (D1–D5)

Per mockup. Structure top-to-bottom: arch crest (sand, echo of splash arch) → eyebrow
"WELCOME ABOARD" → headline → reassurance sub → "Place name" field (placeholder
"Home, The Smiths, Lake house…") → Continue (espresso, primary; disabled-empty) →
"I'll do this later" (quiet link) → "or" divider → teal expander "Already have an invite?
Enter it here" → (expanded) dashed teal panel: "Got a link or code from someone? Join their
place instead:" + code field + Join.

- **Continue:** renames the sentinel place to the typed name (existing rename path), burns flag, dismisses.
- **Skip:** burns flag, dismisses. Sentinel stays.
- **Join (code):** routes through the existing `join_household(text)` server-validated path
  (migration 030) exactly as `?invite=` does — one join implementation, two entrances. On
  success, burns flag and follows the standard join-switch flow (durable `just_joined_household_id`).

### Orphan solo place — DECIDED (D11)
Code-join from this sheet soft-deletes the auto-created solo place under the four-condition
guard. Note the edge the guard resolves correctly: text typed into the name field but never
Continued was never saved — the place is still sentinel, still unclaimed, cleaned. Tapping
Join is the user saying "this isn't where I meant to be." No cleanup path exists anywhere
else — skip-and-use makes the place theirs by use (first item breaks zero-items forever).

## 5. Two share verbs (D6–D8)

Both use `navigator.share()` with the existing clipboard + "Link copied" toast fallback.
No in-app share UI. Placement per mockup: household sheet, Invite aboard primary
(espresso card), Share the app directly below (outlined, subdued).

| | Invite aboard (exists) | Share the app (new) |
|---|---|---|
| Link | `?invite=CODE`, minted per share (RPC, `invitePreparing` spinner) | `?ref=USERCODE`, static — no RPC, no spinner |
| Copy | "Come aboard my OurProvisions list — join {place} and it gets smarter as we go. {url}" | "I've been using OurProvisions to keep our shopping list straight — worth a look. {url}" |
| Names the place? | Yes | **Never** — the copy itself can't be mistaken for a list invitation |
| Recipient lands | in the sender's place; welcome sheet never fires | solo-start; welcome sheet fires; `referred_by` written |
| DB at send | invite row created | nothing (D10) |

## 6. Referral carry (D7, D9, D10) — schema

Migration (number at point-of-build, per standing rule):

- `users.referral_code text UNIQUE` — stable, human-shareable (short, unambiguous alphabet;
  builder picks length/charset). Minted per D9.
- `users.referred_by uuid NULL REFERENCES users(id)` — written **once**, at signup, iff the
  arrival URL carried a valid `?ref=`. Never overwritten; self-referral rejected server-side.
- Attribution write happens inside the bootstrap path (server derives the new user from JWT
  per the Part-2 pattern; `ref` code arrives as a parameter but grants nothing, so it is not
  an authorization surface — still validate it resolves to a live user or store null).
- The tree query is a recursive walk on `referred_by`. No UI in this build — the data is the
  deliverable; surfacing it is a later session.

## 7. Verification

1. Fresh signup, bare URL → sheet fires once; name → header/switcher shows it; reload → no re-fire.
2. Fresh signup, bare URL → Skip → sentinel stays; reload → no re-fire; pencil rename still works.
3. Fresh signup via `?invite=` → sheet never renders; join flow unchanged.
4. Sheet → valid code → joins correct place; flag burned; orphan soft-deleted (D11) —
   gone from switcher, `deleted_at` set in DB. Control: add one item first via console/API,
   then code-join → place SURVIVES (guard's zero-items condition holds).
5. Sheet → invalid code → server 4xx surfaces as inline error ("Invite not found."); sheet stays.
6. Share the app → OS sheet with ref URL + app copy; **no invite row created** (DB check).
7. Signup via `?ref=` → `referred_by` set; welcome sheet still fires (ref ≠ enroll).
8. Signup via typed bare URL → `referred_by` null.
9. Two-hop: A refers B, B refers C → recursive query returns A→B→C.
10. Existing user signs **in** (not up) → flag never set, sheet never renders.

## 8. Explicit non-goals (v1)

- No referral UI/counts/leaderboard (no gamification — July lock).
- No interstitial before either share verb.
- No change to invite-code lifecycle or `join_household` internals.
- Earned-Our header (`SPEC_wordmark_earned_our.md`) is a **sibling build, not a dependency** —
  this spec neither blocks nor is blocked by it, but shipping both together makes the solo
  narrative coherent (header says "Provisions" while the sheet welcomes you to your first place).
