# SPEC — Durable invite hold: a tapped invite must survive sign-up

**Scope:** OurProvisions
**Status:** READY TO BUILD — Part A. Part B (member no-op) is a separate commit in the same session.
**Type:** Bug fix at the link → bootstrap seam. Confirmed on prod twice (Xavier 2026-11-06, Dan 2026-11-08).
**Risk:** Part A medium — client-only, but it is the path every new member walks. Part B touches `bootstrap_new_user` (migration; prod walk with read-backs).
**Priority:** Ahead of Ask Slice 3. Every invite sent today can fail the same way.
**Surface:** `src/lib/preRum.js`, `src/hooks/useProvisions.js` (bootstrap), `src/App.js` (welcome sheet, invite share text), one migration.

---

## 1. The defect, with evidence

| | Xavier (prod, 2026-11-06) | Dan "Invite1" (prod, 2026-11-08) |
|---|---|---|
| Link | Invite aboard, Madbury, code `5EA0IB`, sent 6:45pm | Invite aboard, Invite Test |
| Code row after sign-up | `accepted_at null, accepted_by null` — **never reached the server** | (run Q1 for Invite Test — expect the same) |
| Sign-up result | `created_household = true` → solo "My Household" | same — welcome sheet on "My Household" |
| Red "invite didn't work" line | not reported | **absent** (screenshot) → bootstrap saw **no code at all** |
| Later direct invite | worked (`I5ZL7L`, 8:12pm) | — |

So: the link is right, the server is right, the code is **lost on the phone** between the tap and the end of sign-up. Not expired, not consumed, absent.

### Why it can be lost

`preRum.js` runs at app entry, copies `?invite=` into **`sessionStorage`**, and strips it from the URL (so Splunk replay never sees it — S29/S33). `sessionStorage` is **per tab**. The only copy of the code lives in the one tab the link opened, and it has to survive until `bootstrap_new_user` runs after sign-up. Anything that finishes sign-up in a different tab, or reloads a tab iOS has already evicted, arrives at bootstrap with no code and silently creates a solo place. Known ways to get there on iPhone:

- Clerk verifies the email with a **link** → tapping it in Mail opens a **new Safari tab** (empty sessionStorage). *(Confirm which verification mode prod Clerk uses — Dan + Xavier both "fumbled" sign-up; ask whether they got a code or a link.)*
- Tab backgrounded and evicted; user returns via a fresh tab / typed URL / bookmark.
- Link tapped while signed in to the home-screen (standalone PWA) app: Messages opens Safari, the PWA has its own storage, the code stays in Safari. (Elly's tap, probably.)

The welcome sheet's recovery ("Already have an invite? Enter it here") cannot catch this: the code is only ever inside the URL, and iMessage's card shows only the domain. A real invitee never sees a code to type.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| A1 | Hold `invite`, `ref` and the `/g/` gift code in **`localStorage`** (origin-wide, survives new tabs, tab eviction, reload, PWA ↔ Safari within the same browser), each as `{code, heldAt}`. `sessionStorage` is no longer the store. | Removes the single-tab assumption that both repros broke. Same hold-before-Splunk timing; nothing changes for replay. |
| A2 | A held code **expires with its species**: invite 7 days (matches `expires_at`), ref 30 days, gift 7 days. Bootstrap ignores and clears anything older. | A code tapped last month must not enroll someone today. |
| A3 | Bootstrap still **consumes on first attempt** (clear after the RPC, success or fail) — unchanged. Last writer wins when two codes are tapped before sign-up — unchanged. | Keeps the "a reload can't re-fire" guarantee. |
| A4 | **Welcome sheet accepts a pasted link or a code.** The field parses `?invite=CODE` out of a URL before calling `joinHouseholdByCode`. Copy under the field: "Paste the invite link or its code." | Makes the recovery route real: the one thing an invitee *can* get at is the link. |
| A5 | **Invite share text names the code**: "Come aboard my OurProvisions list — join Madbury. Code 5EA0IB if the link doesn't open the app." `text` carries the code; `url` is unchanged. | Second recovery route; costs nothing. Works on the desktop copy-to-clipboard path too. |
| A6 | **Telemetry, booleans only, never the code**: span event `invite_held` (preRum held an invite), `invite_consumed` on bootstrap with `{present: bool, outcome: 'joined' \| 'failed' \| 'absent'}`. Same `tracer.startSpan` pattern as `household_invite_created`. | Next time a code goes missing we see *where*. Both repros were diagnosed by SQL and screenshots because the client reports nothing. |
| A7 | Welcome sheet gets no new condition; `just_signed_up` + sentinel name still fire it. The late-join offer (`SPEC_late_join.md`) stays a separate, later spec — this fix should make it rare. | One change at a time. |

### Why not just stop stripping the URL
Keeping `?invite=` in the URL would re-expose the code to Splunk replay and the documentLoad span (the reason preRum exists). The hold is right; its *storage* was wrong.

### Why not bind the code to the Clerk sign-up
Passing the code via `SignUp.unsafeMetadata` and reading it from the JWT would make the server independent of the browser entirely. Right fix for Harbour later; heavier (JWT template change, Clerk + server) than this incident needs. Logged, not built.

## 3. Part A — client edits (builder confirms anchors by grep)

**`src/lib/preRum.js`**
- `cleanEntryUrl(href, storage)` takes a storage with get/set — pass `window.localStorage`. Store `JSON.stringify({code, heldAt: Date.now()})`. Keep the never-overwrite-with-nothing rule.
- Export `readHeld(key, maxAgeMs, storage)` → code or null; clears on expiry/garbage. Export `clearHeld(key, storage)`.
- Export the three max-age constants (A2).
- Keep the import-order test; update the storage stub in `preRum.test.js`.

**`src/hooks/useProvisions.js` (bootstrap, ~604–672)**
- Replace the two `sessionStorage.getItem` reads with `readHeld(INVITE_KEY, …)` / `readHeld(REF_KEY, …)`; replace the two `removeItem`s with `clearHeld`.
- Emit `invite_consumed` (A6) right after the join branch resolves.
- `just_joined_*`, `just_signed_up`, `invite_failed` stay in `sessionStorage` — they are same-load intents, correctly tab-scoped. **Do not move them.**

**`src/App.js`**
- Gift card reads (`~5201`, `~7455–7458`): `readHeld(GIFT_KEY, …)` / `clearHeld`.
- Welcome sheet code field (`joinHouseholdByCode` caller): parse a URL first — `new URL(trimmed).searchParams.get('invite')` inside try; fall back to the raw string. Update the helper copy (A4).
- `handleInviteShare` (`~7562`): include the code in `text` (A5). The code is the last path segment of `url` after `?invite=`.

## 4. Part B — member tap is a no-op (separate commit, migration N at build)

`bootstrap_new_user` step 2: before `insert … on conflict do update set deleted_at = null, role = 'member'`, check for a **live** membership. If the caller is already an active member of the invite's household: return the normal "existing household" shape with `joined_via_invite = false`, **do not stamp `accepted_at`, do not touch `role`.** Leave-then-rejoin (soft-deleted row) still revives as today.

Fixes two live bugs in one line of plpgsql: a member's tap burning a single-use code, and an owner's tap demoting themselves to `member` (Q3 shows nobody hit it yet — keep it that way; it is why the repro used a throwaway place).

## 5. Verify

**Part A, deployed dev, real iPhone, Messages → Safari, fresh identity each run (`dan+invN@velayo.ai`):**
1. Tap invite, sign up immediately → lands in the invited place, header shows it, no welcome sheet. Q1: `accepted_by` = new user.
2. Tap invite, leave Safari for 10 min, return (let iOS evict if it will), sign up → same result.
3. Tap invite, **close the tab**, open a new tab to the bare URL, sign up → same result. *(This is the case the old store could never pass.)*
4. If Clerk uses email-link verification: tap invite, sign up, verify from Mail → same result.
5. Signed-in standalone PWA, tap an invite in Messages (opens Safari) → joined in Safari; PWA shows the place after reload.
6. Welcome sheet: on a solo place, paste a full invite **URL** into "Enter it here" → joins, solo orphan discarded (D11). Paste a bare code → same.
7. Share text (A5) carries the code on both the share-sheet and clipboard paths.
8. Stale hold: set `heldAt` 8 days back in devtools, reload, sign in → ignored and cleared; `invite_consumed{present:false}`.
9. Splunk: replay's first pageUrl and the documentLoad span show no `invite=` (unchanged guarantee). `invite_held` / `invite_consumed` appear with booleans only.
10. Regression: existing user pastes an invite URL while signed in → lens moves (`SPEC_invite_paste_autoswitch` still green).

**Part B, dev then prod walk:**
1. Owner taps own place's invite → still owner, code still `accepted_at null`.
2. Member taps → role unchanged, code unburned; a new user then uses the same code → joins.
3. Left-then-rejoin via invite → revived as member (unchanged).
4. Read the function back with `prosrc` from `pg_proc`.

## 6. Out of scope
`SPEC_late_join.md` (bringing a stranded solo list aboard — Xavier's 6 items), multi-use/group invites (a product decision, not this bug), binding the code to Clerk metadata (Harbour).

## LOG_SEED
Fixed invites lost at sign-up: the held `?invite=` / `?ref=` / gift codes move from per-tab sessionStorage to expiring localStorage, the welcome sheet accepts a pasted link, the share text names the code, and bootstrap reports held/consumed as booleans. Root cause confirmed on prod twice (code row never stamped; no failed-invite line) — the tab holding the code did not survive sign-up. Part B: a current member tapping an invite no longer burns the code or resets their role.
