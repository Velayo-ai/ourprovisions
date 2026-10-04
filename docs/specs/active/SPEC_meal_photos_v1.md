# SPEC — Meal Photos v1: the household's own photos, taken at Cooked it

**Scope:** OurProvisions
**Status:** Designed 2026-10-03/04 in the design chat. Mockup of record: the **"Meal Photos"** design canvas (private to Dan), artboards *A · Library*, *Capture · Cooked it*, *Meal sheet*. Artboard *B* is the rejected direction, kept for the record. **Not sequenced before** the Meal Library + un-plan prod promotion.
**Builds on:** `SPEC_meal_library_v1.md` (v1.1 folded) and `SPEC_meal_library_unplan.md`; `meal_cooks` (058); the ✓ Cooked afterglow (`afterglowIds`).
**Supersedes:** nothing. It implements the 2026-09-22 photo principle's "later": *photos are optional household content, never required application content; no stock or generated food photography; the typographic card is the finished design; a household's own photo can sit behind the text.*

---

## Why this exists

A meal card with the household's own photo of their own dinner is the most "Our" thing the app can show. It is also the first content type for the crew news feed, and gives recipe gifting a "here's how it came out." The risk is a library where a few photographed cards make the rest look unfinished. This spec takes the photo in at the honest moment (a cook) and puts it on the card without breaking the grid.

---

## Decisions locked

| # | Decision | Rationale |
|---|---|---|
| D1 | **A photo belongs to a cook.** It is captured at **Cooked it** and stored against that `meal_cooks` row. | The photo shows what this household made that night, not an aspirational hero shot. *Never show state the data doesn't support.* It also feeds the crew feed later with no new plumbing. |
| D2 | **The newest upload holds the card.** For each meal, the card shows the live photo with the latest `uploaded_at`, whoever uploaded it. No chooser, no pinning. (Dan, 2026-10-03.) | Nobody has to manage it. Within a household, last write wins, so the card shows the household's most recent table, not one person's. |
| D3 | **"Latest" means latest upload, not latest cook.** A photo added later to an older cook takes the card. | That's the one somebody just cared about. |
| D4 | **Removing a photo is the only control.** On removal the card falls back to the next-newest live photo, then to the tone tile. | It's the one control D2 needs to stay safe from a bad photo, so it exists at v1. |
| D5 | **Library card = option A: the photo replaces only the colour band.** Same outline, height and white strip as a tone-tile card; the occasion word and name sit on the photo over a top scrim (cream text); the strip's count and pill are unchanged. | Photographed and tone-tile cards share one silhouette, so a half-photographed grid still reads as one grid and tone tiles never read as "missing photo." **Rejected: B, full bleed** (photo cards become a different object; tone tiles look unfinished). |
| D6 | **Capture is one quiet affordance:** a text button **"Add a photo"** (camera glyph, no fill, no border) on the ✓ Cooked afterglow card only. It is not dimmed with the card and leaves with the afterglow on the next board load. | No prompt, no nag, no modal. Coaching retires by behaviour, never by a ✕. |
| D7 | **The meal sheet is the fallback and the history.** The cover is the card photo. Below it, **"From your cooks"**: one tile per cook (date · monogram); the card photo is marked **On card**; a cook without a photo says **No photo** in plain text; an **Add** tile adds a photo later. Line: *"The newest photo shows on the card."* Tiles are not pickers. | The afterglow is brief, so there has to be a second door. It shows the rule rather than offering a setting. |
| D8 | **No placeholders, ever.** No grey camera icon on empty cards, and no "add a photo" on library cards. | The typographic card is the finished design. |
| D9 | **No stock, generated or AI food photography, anywhere.** | The 09-22 principle, restated because the Galley will be tempting. |

### Proposed, confirm before build

| # | Proposal | Default if not confirmed |
|---|---|---|
| P1 | **One photo per cook** in v1. A second upload to the same cook replaces it (the old one is soft-deleted). | Yes. |
| P2 | **The meal sheet's Add tile attaches to the newest cook that has no photo.** If every cook has one or the meal has never been cooked, it attaches to the meal with no cook (`meal_cook_id` null). This is also the door for "Grandma's chili from a photo I already have." | Yes. |
| P3 | **Any member can remove any photo** in the household (soft delete). The tile shows who added it. | Yes. Shared household content, like the list. |
| P4 | **Photos never travel with a gifted recipe** in v1. | Yes. The gift is the recipe; the photo is the household's table. |
| P5 | **Home's on-deck card does not show photos** in v1. | Yes. Home stays the essentials; revisit with the crew feed. |

---

## Data

**Step 0, read-only, before any code:** `is_member_of`'s exact signature on dev and prod; how `meal_cooks` rows are keyed (id, household, meal); whether Supabase Storage is enabled on both projects and whether its policies can read `auth.jwt()->>'sub'` under Clerk third-party auth. If Storage cannot authorize by the Clerk JWT, **stop** and bring it back to the design chat.

**Migration (number assigned at build).** A new table, sketched:

- `meal_photos`: `id uuid pk`, `household_id uuid not null`, `meal_id uuid not null`, `meal_cook_id uuid null`, `storage_path text not null`, `uploaded_by uuid not null`, `uploaded_at timestamptz not null default now()`, `deleted_at timestamptz null`, `width int`, `height int`.
- FKs: `meal_id` and `meal_cook_id` **CASCADE** (the photo has no meaning without them); `household_id` **CASCADE**. Record any deviation from the `catalog_items` FK conventions in ARCHITECTURE.
- Index: `(meal_id, uploaded_at desc) where deleted_at is null`, which serves D2's card read.
- RLS on. SELECT for members (`is_member_of`). **No direct INSERT, UPDATE or DELETE.** Writes go through two SECURITY DEFINER RPCs, membership first (`42501`), identity from `auth.jwt()->>'sub'`, `search_path` pinned, EXECUTE to `authenticated` only:
  - `add_meal_photo(p_meal_id, p_meal_cook_id, p_storage_path, p_width, p_height)` checks that the cook belongs to the meal and the meal belongs to the caller's household, checks that the path starts with that household's prefix, and (P1) soft-deletes any live photo on the same cook.
  - `remove_meal_photo(p_photo_id)` soft-deletes it.
- **Grants:** revoke `authenticated` defaults before granting SELECT (the 046 lesson). VERIFY probes are case-insensitive (the 060 lesson).

**Storage.** A **private** bucket `meal-photos`, paths `{household_id}/{meal_id}/{uuid}.webp` (or `.jpg`). Object policies: read and write only when `is_member_of(first path segment)`; no public URLs. Served by **signed URLs** with a short TTL, fetched in batch for the visible grid. Storage objects follow soft delete by a later sweep, not at removal (a removal must be undoable by an admin).

---

## Client

- **Capture (D6):** a hidden `<input type="file" accept="image/*">` behind "Add a photo" (the camera or library on a phone). On choose: **decode → re-encode on the client** to ≤ 1600 px on the long edge, WebP (JPEG fallback), quality ~0.8. Re-encoding through a canvas **drops all EXIF, GPS included**. That is the privacy guarantee, and it must be proven (Verification 5).
- **Upload:** to Storage, then `add_meal_photo`. Show progress on the card; on failure, a quiet toast and the card is unchanged. No retry loop beyond the existing hold-and-retry for transient errors.
- **Library (D5):** the card reads the meal's newest live photo (one query for the household's card photos, joined client-side). Photo → band image `object-fit: cover`, top scrim, cream text. No photo → tone tile, unchanged.
- **Meal sheet (D7):** cover and the "From your cooks" row. Each tile is from `meal_cooks` left-joined to `meal_photos`; removing is a long-press or ⋯ on the tile (mockup pass for that control before build).
- **Loading:** a card never flashes from tone tile to photo on a cold open. Gate the photo layer on the photo read, the `provenanceLoadedFor` pattern: render the tone tile until the read for this household resolves, then fade the photo in once.

### RUM, a prod gate

Session replay must **not record household photos**. Images are household content, the same class as meal names. Step 0 reads `rum.js` and the installed recorder's options: if `maskAllText` does not cover `<img>` and `background-image`, add an explicit image exclusion for the photo elements and prove it in the prod bundle. No class used on a photo element joins `CHROME_ALLOW_LIST`. Expected allow-list delta: **`.lib-photo-add`** ("Add a photo", fixed copy) only, reported by name.

---

## Known and accepted

- **The afterglow is device-local**, so only the device that tapped Cooked it sees "Add a photo". Other members use the meal sheet.
- **iPhone HEIC:** Safari hands the file input a JPEG in most cases. A file that can't be decoded gets a quiet "Couldn't read that photo" and nothing is written.
- **Bandwidth at sea:** ~200–400 KB per photo after compression, and the grid loads signed URLs lazily below the fold.
- **Storage cost and retention** are not designed here. Revisit at 100 households.

## Out of scope

The crew news feed and reactions; photo on gift; Home photos; upload at meal create; AI-anything on photos (fridge-photo scanning is its own sibling to receipt extraction); multiple photos per cook.

---

## Verification (dev preview, two accounts, real phone for capture)

1. **Capture.** Cooked it → afterglow shows "Add a photo" → choose a photo → the card in the library shows it inside the band (option A), with no reload.
2. **D2 across members.** DT adds a photo to an older cook of the same meal → within a poll, DH's card shows DT's photo.
3. **D4 fallback.** Remove the newest → the card shows the previous photo; remove that → the tone tile returns.
4. **No placeholder.** A never-photographed meal looks exactly as today; nothing invites a photo on the library card.
5. **EXIF gone.** Upload a phone photo with location on; download the stored object and confirm it has **no EXIF and no GPS** (Claude Code reads it with a metadata tool). This is a hard gate.
6. **RLS.** A non-member gets `42501` on both RPCs and cannot read the object path (signed URL request refused); anon is refused everywhere.
7. **No flash.** Cold open under Slow 4G: tone tiles, then photos fade in once; never a photo then a tone tile.
8. **Grid at 390 px.** Two photographed and four tone-tile cards read as one grid; names stay legible on a bright photo (scrim contrast ≥ 4.5:1 for the 20 px name against the photo's top third).
9. **Replay.** On a dev build with the prod masking forced on, a replay of the library shows no photo content.
10. **Allow-list.** Exactly the expected delta, by name, in the deployed bundle.

**Done when:** all ten pass on dev, P1–P5 are confirmed or amended, Step 0's answers are recorded in ARCHITECTURE, and prod is held for its own promotion (migration and bucket first, then the client).
