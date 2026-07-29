# SPEC — Places Rename (user-facing copy only)

**Scope:** OurProvisions
**Type:** Copy rename. No schema, no RPC, no identifier changes.
**Risk:** Low blast radius by design — but ONE trap (see §2). Grep-verified against App.js + useProvisions.js on the date of writing; line numbers WILL have drifted — Cody must re-grep each anchor before editing.

---

## 1. Decision & rationale

We are renaming the **user-facing** concept "Household" → "Place" to match the
evolving product model (Places + Events living in one switcher). We are
deliberately **NOT** renaming the schema (`households`, `household_id`,
`household_members`, RPCs, storage bucket, React identifiers).

**Why copy-only:**
- The database doesn't care what the concept is called. `household_id` as an
  internal join key is invisible to users. Renaming it touches RLS policies,
  realtime subscriptions, and every query — high churn, zero user-visible gain.
- **Events is coming.** When it lands, the likely model is a single `contexts`
  table (type = place | event), not parallel `households` + `events`. Renaming
  `households` → `places` now means renaming it again to `contexts` in a month.
  Rename schema once, later, deliberately — not twice.
- Mental model: **"Place" is the product word; `households` is where it's stored
  today; that storage generalizes to `contexts` when Events arrives.**

---

## 2. ⚠️ TRAP — do NOT rename the grocery category

`"Household"` also exists as a **grocery aisle category** (cleaning supplies,
paper goods) alongside Produce, Dairy, Bakery. This is NOT the Place concept.

**A global find-and-replace of "Household" WILL corrupt this.** Leave every
instance of the category untouched. Known category anchors (re-grep):

- App.js ~15  — `"Household": "🧹 Household"` (emoji map)
- App.js ~21  — category array `[..., "Household", "Bakery"]`
- App.js ~802 — `let cat = item.category || "Household"`
- App.js ~1432 — `const rawCat = row.category || "Household"`
- useProvisions.js ~650 — `const category = categoryName || "Household"`

**Rule for Cody:** rename strings ONE AT A TIME from the map in §3. Do not run a
blanket sed/replace-all on the word "Household."

---

## 3. Rename map (user-facing strings ONLY)

Each entry: file · approx line · current → new. Re-grep the current string as the
anchor; edit only that occurrence.

### App.js
| ~line | current string | new string |
|------|----------------|-----------|
| 943, 934–935 | default name `"My Household"` | `"My Place"` |
| 1028 | fallback `"my household"` | `"my place"` |
| 1266 | `"Leave this household? Anything you added stays behind for the others."` | `"Leave this place? Anything you added stays behind for the others."` |
| 1278 | `"You left the household"` | `"You left the place"` |
| 1280 | `"Could not leave household"` | `"Could not leave place"` |
| 1295 | `"Household deleted"` | `"Place deleted"` |
| 1298 | `"Could not delete household"` | `"Could not delete place"` |
| 1388 | `"Household needs a name"` | `"Place needs a name"` |
| 1714 | aria-label `"Manage household"` | `"Manage place"` |
| 1985 | button `"+ Create new household"` | `"+ Create new place"` |
| 1992 | placeholder `"Household name"` | `"Place name"` |
| 2048 | `"This household"` (in `… · Members`) | `"This place"` |
| 2119–2126 | button `"Leave household"` | `"Leave place"` |
| 2171 | `"Edit household"` | `"Edit place"` |
| 2320 | `"Deletes {name} for everyone aboard…"` — **no change needed** (uses `household?.name`, not the word); fallback `"this household"` → `"this place"` |
| 3687 | `"We've set you up with a fresh household."` | `"We've set you up with a fresh place."` |
| 3726 | fallback `'that household'` → `'that place'` (leave `householdName` identifier alone) |

### useProvisions.js
| ~line | current string | new string |
|------|----------------|-----------|
| 1177 | invite fallback `"the household"` | `"the place"` |

**Invite/join flow note:** verified — the flow surfaces the *place's name*
(`household.name` / `invite.households?.name`), NOT the word "household." Only the
fallback strings above need changing. The join banner needs no logic change.

---

## 4. KEEP-LIST — do NOT touch (identifiers, invisible to users)

Leave ALL of these exactly as they are:

- **Tables/columns:** `households`, `household_id`, `household_members`,
  `household_invites`, `household_staples`, `household-photos` (storage bucket)
- **RPCs:** `create_household`, `join_household`, `leave_household`
- **React identifiers:** `switchHousehold`, `activeHouseholdId`,
  `ActiveHouseholdContext`, `ActiveHouseholdProvider`, `useActiveHousehold`,
  `showHouseholdModal`, `setShowHouseholdModal`, `newHouseholdName`,
  `setNewHouseholdName`, `loadForHousehold`, `updateHouseholdBanner`,
  `removeHouseholdPhoto`, `renameHousehold`, `createHousehold`,
  `handleLeaveHousehold`, `just_joined_household` (sessionStorage key),
  `systemMessage.householdName`
- **The grocery category `"Household"`** (§2)
- **Code comments** — optional; not user-facing, low value, skip to keep the diff clean.

---

## 5. Out of scope (separate future work)

- Schema → `contexts` generalization (deferred until Events design session)
- The Events dimension itself
- The new Home Screen / activity feed
- Marketing/email vocabulary (welcome email, landing page) — a separate copy
  pass; flag but do not touch in this build.

---

## 6. Verify (Cody, on dev preview)

1. `grep -rin "household" App.js useProvisions.js` — confirm every remaining hit
   is either the grocery category or a KEEP-LIST identifier. Zero user-facing
   "household" strings should survive except the category.
2. In the running app on dev: open the manage sheet → confirm "Manage place,"
   "Edit place," "Leave place," "Create new place," "Place name" placeholder.
3. Trigger a leave + a delete → confirm toasts read "place."
4. Confirm the grocery category still reads "🧹 Household" in Browse.
5. CI=true: no new ESLint warnings (pure string edits — should be clean).
