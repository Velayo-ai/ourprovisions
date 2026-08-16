# SPEC — Household photo header ("OurBanner")

**Status:** Active — designed, ready to build
**Scope:** OurProvisions
**Beat:** 1
**Migration:** 024  ⚠️ **not 023 — see the number note below**
**Design session:** 2026-07-17/18
**Approved mockup:** `docs/mockups/mockup_ourbanner.html` — **the tiebreaker if this prose disagrees**
**Reference prototype:** `docs/mockups/crop_tuner.html` — kept; the control was discovered here
**Supersedes:**
- `docs/mockups/household_photo_header.html` (Beat 1 eye-test, 2026-07-11) — scrim + fixed-slice model overridden
- an earlier same-night draft of this spec claiming migration 023 — **delete it**, it predates the OurBanner decisions

---

## Summary

A per-household photo becomes the app header background. The household frames it
themselves — drag and zoom — and the household decides how loud the OurProvisions
wordmark sits over it, including hiding it entirely.

Product argument: the list is shared, the household is shared, the photo is shared.
**The group sets the look.** Not a user preference.

Households without a photo keep today's espresso header, unchanged, and never see
the banner control.

---

## ⚠️ Migration number — read first

**This takes 024.** The high-water mark moved twice on 2026-07-17/18 and ROADMAP
prose is stale:

| # | Owner | Status |
|---|---|---|
| 021 | `beta_signups` | applied dev + prod |
| 022 | **anon catalog exposure fix** | **applied dev + prod 2026-07-18** — `SPEC_anon_catalog_exposure.md` |
| 023 | referral primitive | specced, not applied *(was 021, then 022 — renumbered twice already)* |
| **024** | **this spec** | not built |

This is the **third** double-claim in four migrations. The pattern is that specs
claim a number at design time and the number moves before build. **Assign at
point-of-build, not at design time**, and check `migrations/` for the true
high-water mark before writing any number into a file.

---

## Decisions

### D1 — The group owns the look

Photo, framing, banner state, and name are all **household state**. Any member
changes any of them. Same class as the household name, which already works this way
and has never generated a complaint.

*Considered and rejected:* per-user banner preference alongside `list_text_size`.
Rejected because a private reskin of shared chrome is the one place the app would
quietly stop being *ours*. The name "OurBanner" is the argument.

**Accepted cost:** Helen changes the banner, Dan's header changes with no
attribution and no notice — exactly how the household name behaves today. No
"Elly changed this" signal is in scope.

### D2 — Permissions

| Action | Who |
|---|---|
| Add / replace photo | **any member** |
| Reframe (position, zoom) | **any member** |
| Remove photo | **any member** |
| Change banner state | **any member** |
| Rename household | any member *(unchanged)* |
| **Delete household** | **creator only — unchanged, stays in the switcher modal** |

Delete was explicitly held at its current gate and current location. It isn't
editing; it ends a thing three people use, and whoever brought it into existence
ends it. `"Created by you"` therefore keeps its meaning and stays.

### D3 — The banner control only exists when a photo exists

**No photo → no control.** Wordmark renders `large`, the band has its centre of
gravity, and the empty-band case is unreachable by construction.

This is the load-bearing rule. The setting appears at the moment it becomes
meaningful — you added a photo, now there's a reason to care how loud the brand is
over it. There is no "hidden + no photo" state to design around.

### D4 — Three banner states

| State | Wordmark |
|---|---|
| `large` | today's header — Playfair italic, centred. **Default.** |
| `small` | ~⅔ size, ~80% opacity, same position |
| `hidden` | **not rendered.** Middle band is the photo, nothing else. |

**The household name stays in the top bar in all three states.** It does not
promote, move, or resize.

**Hidden means hidden.** No corner mark, no fallback lockup.

### D5 — Why hidden has no floor *(four attempts, three failures)*

Hidden was designed four times:

1. **Household name promotes to hero** → long-name overflow. "Sacandaga" fits at
   19px Playfair; "Mom and Dad's House" does not.
2. **Wordmark demotes to a corner mark** → legibility depended on what the user
   framed. Dark windows behind it: readable. Bright water behind it: gone. **A mark
   that needs per-photo tuning cannot ship** — we can't tune per household.
3. **Corner mark relocated into the tab strip's guaranteed-dark scrim** → legible
   on any photo, but it displaced PLAN/BROWSE/SHOP rightward. Switching to hidden
   would have moved the user's navigation.
4. **Nothing.** Ships.

Every failure was downstream of #1. Removing the first domino removed the chain.

**Orientation is answered elsewhere:** the app icon says which app; the household
name in the top bar says which household. The band needn't repeat either.

*Generalizable:* when three consecutive fixes to one idea each introduce a new
defect, the idea is wrong, not the execution.

### D6 — Framing is persisted state, not an import gesture

A 2.6:1 band can't be filled by an arbitrary photo without choosing **both**
position and scale. `IMG_7897` at zoom 100% takes half the frame's height and still
drags in a third driveway; it frames correctly around 165%. **Position alone is
insufficient** — Beat 1's three fixed slices could not express this.

So `photo_position_x`, `photo_position_y`, `photo_zoom` are columns on
`households`, re-editable any time. Non-destructive: the stored original is never
modified after EXIF normalization. Reframing writes three integers.

Reference values (Sacandaga / `IMG_7897`, eye-tested): **x=40, y=46, zoom=165**.

### D7 — The preview is the control

**No separate crop screen.** The rectangle the user drags *is* the header — same
scrim, same wordmark, same tabs, same aspect. They aren't framing a rectangle and
hoping; they're looking at the result.

This came from `crop_tuner.html`: the tool built to tune one photo turned out to be
the feature. Claude had pixel access and colour sampling and picked the wrong slice
three times; Dan fixed it in five seconds with a slider.

**Zoom is a slider, not pinch.** All four beta testers reached for long-press over
swipe — this group doesn't reliably discover gestures. Discoverable beats elegant.

### D8 — Empty state shows the real header

No photo → the preview shows **the actual header**: espresso, wordmark large,
household name, tabs. Nothing invented, nothing pretending.

An earlier draft put an "Add a photo" CTA *inside* the empty band, in the
wordmark's slot. It was redundant with the button below it and made the preview lie
about what the header looks like. **Removed.** The "Choose a photo" button asks;
helper text below reads *"Your household, at the top of every list."*

---

## Schema — migration 024

```sql
alter table households
  add column photo_path        text,
  add column photo_position_x  smallint not null default 50,
  add column photo_position_y  smallint not null default 50,
  add column photo_zoom        smallint not null default 100,
  add column banner_wordmark   text     not null default 'large';

alter table households
  add constraint households_photo_pos_x_range check (photo_position_x between 0 and 100),
  add constraint households_photo_pos_y_range check (photo_position_y between 0 and 100),
  add constraint households_photo_zoom_range  check (photo_zoom between 100 and 320),
  add constraint households_banner_wordmark_valid check (banner_wordmark in ('large','small','hidden'));
```

**`photo_path`, not `photo_url`** — the storage *object path*. URLs embed project
refs and expiry and break across dev/prod. Resolve to a URL at read time.

**`smallint` + percent units map 1:1 to CSS**, no conversion layer, no float drift:

```css
background-size:     {photo_zoom}% auto;
background-position: {photo_position_x}% {photo_position_y}%;
```

Zoom floor of 100 is meaningful: below it the photo wouldn't fill the band.

### RLS

The existing `households` policy is `is_member_of(household_id)` for all commands —
any member can already update the row. **No policy change needed**; D2 falls out of
what's there.

Delete stays creator-gated **in the client**, as today. Do not add a DB-level gate
here — separate decision, separate blast radius.

---

## Storage

Supabase Storage bucket `household-photos`, **private**.

Object path: `{household_id}/header.jpg` — one photo per household; replace
overwrites. No orphan accumulation, no cleanup job.

RLS on `storage.objects` gates by membership, using the established Clerk pattern
(`auth.jwt()->>'sub'`, never `auth.uid()`). First path segment is the household id:

```sql
create policy "household photos readable by members"
  on storage.objects for select to authenticated
  using (bucket_id = 'household-photos'
         and is_member_of((storage.foldername(name))[1]::uuid));

create policy "household photos writable by members"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'household-photos'
              and is_member_of((storage.foldername(name))[1]::uuid));
```

Plus matching `update` and `delete` policies — replace and remove are both
any-member per D2. Reuses the existing `is_member_of()` SECURITY DEFINER RPC, the
same helper the catalog and list policies use.

**Anon gets nothing.** Migration 022 this same session found a policy named
"Anyone can read global catalog items" whose predicate had no `is_global` check —
it leaked 133 custom rows, including a beta user's parent's medication schedule, to
the open internet. **A household photo is a picture of where people live.** The
anon surface stays closed by construction.

**Verification note:** the SQL editor runs as `postgres` and bypasses RLS — it
*cannot* confirm these policies. Test with an authenticated non-member and with an
anon request, as in 022.

---

## EXIF normalization — hard requirement

**Normalize to orientation 1 on upload: bake the rotation into pixels, strip the
tag.**

| Photo | EXIF orientation |
|---|---|
| Sacandaga portrait (2026-07-11) | 6 — rendered sideways |
| `IMG_7897` (2026-07-18) | 3 — stored 180° rotated |

**Two for two.** iPhones write an orientation *tag* rather than rotating pixels.
CSS `background-image` usually honors it; **`<canvas>` `drawImage()` does not** —
and any client-side resize path goes through canvas. Skip this and a predictable
share of beta users get an upside-down house.

The 2026-07-11 "fix" was applied to a derived copy — the original still carries
orientation 6. **Normalize the artifact that gets stored.**

**Verify with a deliberately rotated photo, not a screenshot** — screenshots carry
no EXIF and will pass a broken implementation.

---

## The scrim — band treatment ⚠️ supersedes a documented hard requirement

```css
background: linear-gradient(to bottom,
  rgba(0,0,0,0.86)   0%,   /* top bar: avatar, household name, menu */
  rgba(0,0,0,0.52)  16%,
  rgba(0,0,0,0.04)  34%,   /* photo breathes */
  rgba(0,0,0,0.04)  62%,
  rgba(0,0,0,0.58)  84%,
  rgba(0,0,0,0.88) 100%);  /* tab strip */
```

**Black, not espresso** — per ARCHITECTURE 2026-07-16, confirmed against the live
app.

Text shadows are **load-bearing now, not polish** — they replace the wash the middle
no longer has. Wordmark: `0 2px 14px rgba(0,0,0,.85), 0 1px 3px rgba(0,0,0,.7)`.
Top bar / tabs: `0 1px 6px rgba(0,0,0,.9)`.

### Why this overrides the radial

ARCHITECTURE (2026-07-16) records as a **PROVEN hard requirement**: *"A radial scrim
centred on the wordmark is what let it read."* That finding is right about the
problem. This spec keeps its reasoning and changes the answer.

- **Linear** (Beat 1) assumes content lives in the centre → the Sacandaga flag at
  the **left edge** was crushed regardless of crop.
- **Radial** (landing page) assumes centre-with-soft-edges → solved the flag, but on
  a surface where **we control the photo**.
- **Band** assumes *nothing* about the photo. It darkens only the two horizontal
  strips that are always type — top bar, tab strip — and leaves the middle clear.

The requirement underneath all three is unchanged and **not** superseded: *a scrim
must not destroy what the user just framed.* In the app, photos are arbitrary and
the subject is off-centre as often as not. **A scrim that can't know where the
subject is should protect only where the type is — because that we do know.**

The radial remains correct for the landing hero. **The app header and the landing
hero are now two treatments of one principle, not one shared treatment.** Update
ARCHITECTURE accordingly.

---

## The Edit household sheet

The pencil at `SACANDAGA / Created by you` is rename-only today (inline field +
Save + ✕). **It now opens a sheet.**

*Rejected:* a photo row alongside the inline rename. The detail zone is at capacity
— with the keyboard up, iOS's accessory bar already overlaps `DELETE HOUSEHOLD`
(observed, `IMG_5050`). A photo thumbnail plus controls makes a crowded zone worse.

*Bonus:* the pencil becomes discoverable **because** it does more. A pencil that
only renames doesn't earn a label; "Edit household" does.

Contents, in order:

1. **Household photo** — live preview (D7); drag to reposition
2. **Zoom** — slider, 100–320%
3. **Replace** / **Remove**
4. **Banner** — segmented `Large | Small | Hidden` — **rendered only when `photo_path is not null`** (D3)
5. **Household name** — text field
6. Helper: *"Anyone in the household can change the photo, the name, and the banner."*
7. **Cancel** / **Save changes** — one Save commits framing + banner + name together

Sheet is bottom-anchored: thumbs reach it, and the name field sits high enough that
iOS pushes the sheet up rather than burying it.

**Delete Household is not here.** It stays in the switcher modal.

### Optical centering

The wordmark slot sits **~5% above true centre** (`transform: translateY(-5%)`).

Type in a band reads as low when mathematically centred — the tab strip below
carries visual weight the eye counts, and this worsens once tab icons render. **5%
is provisional; verify on device with icons present.** The right number may be 4 or 8.

---

## Household-scoped state — must swap on `activeHouseholdId`

Per ARCHITECTURE (2026-07-11), the photo is household-scoped state and **must swap
the instant `activeHouseholdId` changes** — same class as the filter-reset rule.
Sacandaga → BVI must not leave Sacandaga's photo in the header for a frame.

All five fields: `photo_path`, both positions, zoom, `banner_wordmark`.

---

## Dormancy — do not "fix" this later

Set `hidden`, then someone removes the photo:

- `banner_wordmark` **stays** `'hidden'` in the row
- the wordmark **renders large**, because `photo_path is null`
- add a photo again → `hidden` reapplies

The setting is dormant, not cleared. Resetting it on photo removal would silently
discard the household's choice. **This will look like a bug to a future reader. It
isn't.**

---

## Client — upload path

1. Read file
2. **Normalize EXIF to orientation 1** — before anything else
3. Downscale long edge to ~1600px, re-encode JPEG ~q80. A 4032×3024 original is
   several MB for a band that is at most 390px wide on a phone.
4. Upload to `{household_id}/header.jpg`
5. Persist `photo_path` + framing

---

## Open — resolve at build

- **Safe-area inset.** The band scrim's darkest stop is at 0% of the *header*, not
  of the *screen*. On a notched device the top bar sits under the Dynamic Island.
  **Check on hardware**; likely wants the top stop offset by
  `env(safe-area-inset-top)`. Not a design change.
- **Optical centre value.** 5% provisional — confirm with tab icons rendered.
- **The switch jolt.** Madbury and BVI have no photo; Sacandaga does. Switching
  flips espresso → photo → espresso. That's the feature working, but it's a large
  visual jolt on every switch. Watch it live before deciding whether it needs a
  transition.
- **Upload UI.** File picker vs. camera vs. both — not designed. Mobile users will
  expect "take a photo" as a peer of "choose a photo."
- **Storage quota.** Supabase free tier; one photo per household at ~200–400KB is
  negligible. Note it, don't solve it.

---

## Verification

- [ ] Upload a **deliberately rotated** photo (not a screenshot — no EXIF) → renders upright
- [ ] Upload `IMG_7897` (orientation 3) → upright, not inverted
- [ ] Drag + zoom → three integers persist; reopen the sheet, framing identical
- [ ] Framing persists across reload and across devices
- [ ] Elly (non-creator) can add, reframe, replace, and remove the photo
- [ ] Elly does **not** see Delete household
- [ ] Second member changes the banner → first member's header follows
- [ ] `hidden` → middle band is photo only; household name still in the top bar
- [ ] Remove photo → banner control disappears; wordmark returns to large
- [ ] Re-add photo → previous banner state reapplies (dormancy)
- [ ] Switch household → header swaps immediately, no stale photo frame
- [ ] Photo-less household renders today's espresso header unchanged, no banner control
- [ ] Authenticated non-member cannot read another household's photo object
- [ ] Anon cannot read any photo object
- [ ] Wordmark and tabs legible against a bright photo at zoom 100 and zoom 320
