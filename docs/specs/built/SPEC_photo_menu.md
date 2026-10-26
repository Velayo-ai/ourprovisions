# SPEC — Photo menu on the photo (recipe view hero + viewer)

**Status:** design-final 2026-10-25 (DAN-1–3 ruled — see the Amendment at the end, which wins where it differs). Build on dev; held from prod until walked.
**Scope:** client only — `src/App.js` (recipe view hero, full-screen viewer, the confirm sheet), `src/rum.js` (allow-list delta), tests. No migration, no RPC change, no Edge Function.
**Origin:** designed by Dan 2026-10-24 in a mobile chat (restaurant), mockup of record the Claude Design canvas **"Photo Menu Flow"** (four screens on the real Black n' Pumpkin photo: the meal sheet, the menu open, the confirm sheet, after removal); reviewed in the design chat 2026-10-25.
**Principle carried in:** *never celebrate deleting* — the gold, primary button goes to the choice that keeps things; removal is quiet (white, red text) and is never thanked with a toast.
**Corrections to the restaurant chat's premise** (it had no repo context): `meal_photos` already exists with `uploaded_by` and per-row RLS (065, live on prod), so no schema change; the up-to-3 gallery is built; Drink shipped to prod 2026-10-25, so "Appetizer for a pint" is closed. Its "Make cover" and "drop the dots" ideas were not carried into the final instruction and are not in this spec.
**Builds on:** `SPEC_meal_photos_v1.md` (+ amendments 10-20, 10-21), built and live on prod since 2026-10-23.

---

## Why

Today the photo's actions hide in a standalone `···` beside "Add a meal photo", away from the photo they act on. The menu belongs **on the thing it changes**, the way every photo app does it. Remove becomes one item in that menu, confirmed in a sheet that shows you which photo goes.

## Decisions

| # | Decision |
|---|---|
| P1 | The "Add a meal photo" row keeps only **Add a meal photo**. Its standalone `···` is removed. |
| P2 | A `···` button sits in the hero's **top-right** corner: 44 px hit area, the same dark translucent circle as the expand button (bottom-right). Fixed copy, `aria-label="Photo options"`. It acts on **the photo currently shown** (the hero swipes through up to 3). |
| P3 | Tapping it opens a menu, in this order: **Replace photo**, **Photo details**, **Save to Photos**, a divider, **Remove photo** in red. |
| P4 | **Remove photo** shows only to people the current rules already let remove this photo. The same predicate the client uses today; no new rule. Other items show to every member. |
| P5 | Remove opens a **confirm bottom sheet** (`SheetPanel`): a small thumbnail of the photo, the title **"Remove this photo?"**, the body **"It'll be removed for everyone in your household."** Buttons: **Remove photo** (white, red text) and **Keep photo** (gold, primary). Keep is the default focus; backdrop, ✕ and swipe-down all mean Keep. |
| P6 | Removal uses the **existing delete path** (`remove_meal_photo`, its storage cleanup, its signed-URL cache invalidation). Logic and permissions unchanged. **No success toast.** |
| P7 | After removing a photo: if others remain, the hero shows the next one (dots update). If it was the **last** photo, the hero keeps its height and shows a **dashed placeholder**: "Add a meal photo" / "Show the household how it turned out." Tapping it is the same as Add a meal photo. |
| P8 | The **full-screen viewer** gets the same `···` in its top-right corner with the same menu (Remove from the viewer closes the viewer first, then opens the confirm sheet). **No trash icon in any toolbar.** |
| P9 | **Replay privacy.** Every new photo element carries `.op-replay-block` — **including the confirm sheet's thumbnail**, a new photo surface. Menu items and buttons are fixed copy. Any allow-listed class is reported by name in the commit; no meal name or count in any copied attribute (labelledby pattern if one is needed). |
| P10 | Menu behaviour follows the existing `···` popover: outside tap closes it and is swallowed; Escape closes on desktop; focus returns to `···`. |

## Calls for Dan before build

**DAN-1 — "Replace photo": what happens at the cap, and in what order?**
There is no replace RPC; it is add + remove. The cap is 3, so at 3 photos an add-first fails. Remove-first risks losing the photo if the upload then fails (bad signal at a dock).
*Design lean:* **upload the new photo first**, then remove the old one; at the cap, the client removes the old row only **after** the new upload's storage write succeeds but before `add_meal_photo`, so a failed upload changes nothing. Step 0 #4 confirms this ordering is possible with the current RPCs; if it isn't, Replace waits and ships without it.

**DAN-2 — "Photo details": what does it show?**
Nothing was specified. What we actually store: who added it (`uploaded_by`), when (`created_at`), and whether it is attached to a cook (and that cook's date). No EXIF (stripped on purpose), no location, no camera.
*Design lean:* a small sheet — "Added by Daniel · Oct 24" and, for a cook photo, "From the cook on Oct 24". This also gives Details a job the restaurant chat found: the hero shows **"Added today · You"** right above the recipe's **"Added by Daniel"**, the same person named two ways. If Details holds the photo credit, the line under the photo can go. **Dan: move the photo credit into Details (and drop the line), or keep both?** Or drop Details from v1 if that feels thin.

**DAN-3 — "Save to Photos": the 1080 px rendition, through the share sheet.**
We keep two renditions (480 / 1080); the original is never stored, so "full size" is the 1080 view. A web app on iOS cannot write to Photos directly. The honest path is the share sheet (`navigator.share({ files })`), whose "Save Image" puts it in Photos; desktop falls back to a normal download.
*Design lean:* keep the label **Save to Photos** on iOS (where the share sheet makes it true) and **Download photo** elsewhere. If that split feels wrong, call it **Save photo** everywhere.

## Step 0 (read-only, report before code)

1. Quote the current remove predicate (who sees Remove today) and where it lives.
2. Quote the current `···` popover's open / close / outside-tap code, and say whether it can move onto the hero as-is.
3. Name the hero's state for "photo currently shown" and confirm the viewer shares it.
4. For DAN-1: can the client upload to storage, then call `remove_meal_photo`, then `add_meal_photo`, with the cap counted at the RPC? Quote the cap check.
5. Find the **double expand button** seen on prod 2026-10-25 (two ⤢ circles, offset, bottom-right, after a photo was removed and re-added). It sits in the corner this work touches. Report the cause; fix it in its own commit.
6. List the allow-list delta this build implies, by name.

## Verification (dev, Dan on the phone; desktop for P10 / P8 keyboard)

1. The "Add a meal photo" row has no `···`.
2. The hero shows `···` top-right and ⤢ bottom-right; **one** of each, also after remove + re-add.
3. Menu order: Replace, Details, Save, divider, Remove (red).
4. A member who may not remove the photo sees no Remove.
5. Remove → confirm sheet with the right thumbnail and copy; Keep (and backdrop, ✕, swipe) leaves the photo.
6. Remove photo → gone, no toast; with 2+ photos the next shows; with the last, the dashed placeholder at the same height; tapping it adds a photo.
7. Close and reopen the meal after removing the last photo → the tint hero (unchanged rule).
8. Viewer `···` → same menu; Remove closes the viewer, then confirms.
9. Replace (per DAN-1) at 1, 2 and 3 photos; a forced upload failure changes nothing.
10. Save to Photos on iPhone → the share sheet → Save Image lands in Photos; desktop downloads.
11. Photo details (per DAN-2).
12. 320 / 375 / 390 at Default and XXL: the menu fits, nothing clips.
13. Bundle: allow-list delta reported by name; one replay capture shows the confirm thumbnail excluded (`isExcluded`), and no meal name in any copied attribute.

## Out of scope

Library card photo actions. Reordering photos. Captions. Crew / gift photo rules (Phase A).

---

## Amendment 2026-10-25 — Step 0 findings and rulings (wins over the body above)

Step 0 (Claude Code, read-only, dev `41400d6`) corrected four premises; Dan ruled the calls.

**Corrections**
- **P4 is moot.** `remove_meal_photo` lets any member remove any photo (065 P3), and the client shows photo controls to every signed-in member. Remove shows to everyone who sees the menu; "current rules" unchanged. Verification 4 is dropped.
- **P6:** removal is a **soft delete** (`deleted_at`); storage objects wait for the service-role sweep and every upload gets new paths, so there is no storage cleanup or URL invalidation on remove. Nothing changes there.
- **The cap ages out, it does not refuse.** `add_meal_photo` keeps the 3 newest live photos and soft-deletes the rest, so an add at 3 silently drops the OLDEST photo.
- **DAN-2's column is `uploaded_at`**, not `created_at`.
- The viewer keeps its own index (`atRef`); its `···` acts on `photos[atRef.current]`. Not one shared state, and that's fine.
- "Focus returns to `···`" (P10) is not implemented today; this build adds it.

**DAN-1 — Replace, per case (ruled)**
| Shown photo | Order | Failure |
|---|---|---|
| Cook-attached | upload → `add_meal_photo` with the old photo's `meal_cook_id`; the RPC's per-cook replace soft-deletes the old row in the same transaction | Atomic; the "Cooked {date}" caption is kept |
| Meal photo, fewer than 3 | upload → add → remove the old | No loss window; at worst both stay |
| Meal photo, at 3 | upload → remove the old → add | Only the final add can fail after a good upload; the old photo is soft-deleted and recoverable by hand; an **error** toast says so (the no-toast rule is about success) |

`addMealPhoto` splits into upload and save (client only). In every case the replacement becomes the newest photo (slot 1, the library card), not the old slot.

**DAN-2 — Photo details (ruled):** a small sheet: "Added by {First name} · {date from `uploaded_at`}", plus "From the cook on {date}" for a cook-attached photo. The line under the hero ("Added today · You") is **removed** — the photo credit lives in Details, and the recipe keeps "Added by …" alone.

**DAN-3 — Save (ruled):** "Save to Photos" where the Web Share API can share files (iPhone → share sheet → Save Image); "Download photo" elsewhere. The 1080 rendition; originals are never stored.

**Placeholder:** shows only until the sheet closes; reopening shows the tint hero (D8 stands).

**The double ⤢:** only one `.rv-hero-expand` exists in code. The photo re-added 2026-10-25 17:29 UTC is 1080×753 landscape, unlike the three earlier 810×1080 portraits — consistent with a screenshot of the app's own hero being added back. Confirmed or ruled out by Dan in the full-screen viewer; no code change unless the ⤢ is not in the picture.

**Allow-list delta (to prove by name in the bundle):** out `.rv-photo-remove-yes`, `.rv-photo-keep`; in `.rv-photo-replace`, `.rv-photo-details`, `.rv-photo-save`, `.rv-photo-confirm-remove`, `.rv-photo-confirm-keep`, `.rv-photo-placeholder`; `.rv-photo-remove` kept; the `···` trigger stays off the list (named by aria-label). The confirm thumbnail carries `.op-replay-block`; the sheet title is masked and wired by `aria-labelledby`.
