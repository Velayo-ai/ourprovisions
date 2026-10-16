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

---

# SPEC — Meal Photos v1: amendment 2026-10-13

**Scope:** OurProvisions
**Amends:** `SPEC_meal_photos_v1.md` (designed 2026-10-03/04). **That spec stands as written except
where this block differs; where it differs, this block wins.** Append this to the end of v1 rather
than filing it as a separate spec.
**Retires:** the standalone `SPEC_meal_photos.md` drafted in the 2026-10-13 design chat. It was
written without v1 in view and duplicated it. Do not file it; this amendment carries its decisions.
**Status:** Decided by Dan in the design chat, 2026-10-13 (on the phone, travelling).

---

## A1 — Build in two slices; the meal sheet goes first

v1's capture and its fallback ship as two separate builds.

- **Slice 1, the meal sheet:** v1's D7 **Add** tile, P2's attach rule (newest cook with no photo,
  otherwise `meal_cook_id` null), D4 removal, the library card (D5, option A), the no-flash gate,
  RUM, EXIF and Storage. This is the "edit the meal and add a photo" path Dan wants first.
- **Slice 2, the afterglow:** v1's D6 "Add a photo" on the ✓ Cooked afterglow, plus A5's rating.

Why: the meal sheet is the smallest door that puts a photo on a card, and it covers the photo you
already have (Easton's, Grandma's). The afterglow is the second door, and it's where the rating lives.

## A2 — Keep two live photos per meal per household (replaces unlimited history)

After a new upload, only the **two newest live photos** for (meal, household) stay live. Anything
older is soft-deleted (v1's `deleted_at`) and swept from Storage by v1's later sweep.

- D2 and D4 are unchanged: the newest holds the card, and removing it falls back to the other one,
  then to the tone tile.
- D7's "From your cooks" row still lists every cook. A cook whose photo has been aged out reads
  **No photo**.
- Why: Dan, on cost ("keep costs down to store", "just latest −1 in case you want to delete after
  uploading"). With photos expected on a small fraction of cooks, two per meal covers a mistaken
  upload.

## A3 — Two renditions, and the library loads only the thumbnail (replaces one ≤ 1600 px file)

The client makes **two** re-encodes through the canvas, so EXIF is still dropped:

- a **thumbnail** about 480 px on the long edge, for the library card;
- a **viewing copy** about 1080 px, loaded only when the meal sheet opens.

Use WebP with a JPEG fallback, quality about 0.75–0.8. **No original is ever stored.** Hi-res stays
on the phone, and any future Instagram share goes from the phone's own copy.

`meal_photos` carries both paths: `thumb_path` and `view_path` replace `storage_path`. The
`add_meal_photo` prefix check covers both.

- Why: egress, not storage, is the cost that has already bitten (over Free egress until Oct 20).
  A library screen reloads its cards on every visit.
- Verification adds: **a 20-card library screen loads thumbnails only.** Report its total bytes.

## A4 — Photos travel with a gift (reverses P4)

v1 P4 said photos never travel with a gifted recipe. Dan reversed that: *"the feeling will come
from the photo"* (Andrew gives a meal he made with Easton).

- Fits `SPEC_meal_sharing_v2.md`. A gift is a **snapshot at give time**, so the giver's current
  card photo (both renditions) is **copied into the snapshot**. The receiving household gets its
  own copy when it saves the meal. The receiver never reads the giver's path, and the giver later
  removing their own photo doesn't touch the receiver's copy.
- The copy is labelled **"from {giver}"** on the meal sheet. It is the **origin photo**: kept apart
  from the receiver's own uploads and **never aged out by A2**.
- **Card order:** the receiver's own newest photo first, then the origin photo, then the tone tile.
- **Children:** a shared photo reaches only the households someone chose to give to. If a public or
  marketplace layer ever exists, no photo goes there without a deliberate action by whoever took it.
- **Ships with or after the giving build**, never before it. If giving is unbuilt, slices 1 and 2
  ship without A4.
- Open for build: whether the origin photo is a `meal_photos` row with an `origin` flag, or a field
  on the gift copy. Lean: a row with `origin in ('own','gift')` and a `from_label`.

## A5 — An optional 3-star rating on the cook (folds in recipe rating)

Recipe rating, from Laddy's beta feedback, joins slice 2 on the afterglow, next to "Add a photo".
It is just as quiet: ignorable, with no prompt and no nag.

- `meal_cooks` (058) gains `rating smallint null check (rating between 1 and 3)` and
  `note text null` (one optional line, such as "double the garlic next time").
- **058's write shape holds.** No UPDATE policy is added. A new SECURITY DEFINER RPC,
  `rate_cook(p_cook_id, p_rating, p_note)`, may set or clear **only** those two fields. It follows
  the 051/058 pattern: membership first, caller from the JWT. Read `cook_meal`'s body before
  writing it.
- **No vote is not a rating (Dan).** A null rating is never read as 0 or as a low score. Any
  average, "favourite" or ordering signal counts only rated cooks. A meal with no ratings shows no
  stars, never empty stars.
- Ratings show on the meal sheet with each cook tile. Using them in board ordering comes later;
  the data is captured now.
- Verification adds: cooked twice and rated once at 3★ → shows **3★, not 1.5★**. Never rated →
  **no stars**. Skipping the rating leaves the cook logged.

## Out of scope (added)

The **Home activity widget** ("Dan cooked Easton's Grilled Cheese 📷") is its own design item,
alongside who's cooking. `meal_cooks` together with `meal_photos` already feed it.
