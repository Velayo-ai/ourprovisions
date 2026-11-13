# SPEC_meal_sharing_phase_a_client.md — Phase A client slice: give → preview → accept

**Status:** ACTIVE — design chat 2026-10-29. Ready for Claude Code on dev against 072 (ledger `20261029113505`).
**Scope:** OurProvisions · client only, dev first. No migration. Prod gets 072 at Phase A's promotion, before this client.
**Parent:** `SPEC_meal_sharing_v2.md` through Addendum 2026-10-28b (S1–S45). This spec adds the client rulings only; where it's silent, the parent stands.
**Mockup of record:** `mockup_gift_preview.html` (frames A1–A3, B1–B5). The 10-07 prefilled New Meal form (frame 6 of `mockup_new_meal_import.html`) is unchanged for the signed-in recipient.

---

## Decisions (Dan, 2026-10-29)

| # | Decision | Why |
|---|---|---|
| C1 | **The give sheet pre-checks for a showcase photo.** Before Give, the client looks at the meal's loaded `meal_photos` rows for a live `kind = 'showcase'` row with `uploaded_by` = the current user. Found → B1 ("Your showcase photo goes with it"). Not found → B2 ("No photo goes with it … Add a showcase photo"). | The nudge in B2 is the only place a new user learns showcase photos exist. The client predicts; `give_meal`'s server-side pick (S12) still decides, and B4 shows the truth. A stale client list can only err toward "no photo" when one travels, which the Ready screen corrects. |
| C2 | **"Add a showcase photo" opens the uploader in place and returns to the give sheet.** Same uploader and S13 prompt as the recipe view. On success the sheet re-runs the C1 check and shows B1. | Navigating away abandons the give. |
| C3 | **Give is two taps: Give, then Send it.** Give runs `give_meal` + the photo copy (B3). Send it opens `navigator.share` (B4). | iOS only opens the share sheet from a direct user gesture, and the RPC plus two uploads consume it. B4 also previews the public card and surfaces B5 before the link leaves the giver's hands (S34). |
| C4 | **Any partial photo upload is a failure.** Upload `view.{ext}` first, then `thumb.{ext}`, both without `upsert` (S41), then call `attach_gift_photo(gift_id, ext)`. **S47 (2026-10-30, 074):** the bytes travel in the format the showcase was stored in — `webp` or `jpg` (an iPhone showcase; Safari cannot encode WebP) — byte for byte, with the source's own contentType, never re-encoded; both renditions share one extension. If an upload or the mark fails, the client shows B5 ("The photo didn't attach."), the gift ships with no photo, and the client does not retry or delete. | `preview_meal_gift_public` stays pure SQL and never reads storage. The server marks `meal_gifts.photo_ext` only after checking both objects exist in that one format with matching mimetypes, so an unmarked upload is simply no photo. View-first means a failure most often leaves nothing behind; a stray object is harmless (nothing signs an unmarked gift) and the S37 sweep collects it later. Supersedes bf09477's device-side re-encode, which left every Safari giver on B5. |
| C5 | **The public card shows the five S43 fields and nothing else.** No giver name, no note. The note appears only in the signed-in prefilled form (10-07). | A bearer link can reach anyone; the note is the giver's words to one person. |
| C6 | **No From line when `attribution` is empty.** Both the public card and the prefilled form omit it; no placeholder. | "Never show state the data doesn't support." The two surfaces must match. |
| C7 | **One screen for unknown and revoked codes, signed out (A3).** "That link doesn't work. Ask whoever sent it for a new one." The 10-07 "Andrew stopped giving this one" line survives only for signed-in recipients, where `preview_meal_gift` raises `55000`. | `preview_meal_gift_public` returns the same empty result for both (S43), so the page can't tell them apart either. |
| C8 | **`photo_ext` from the RPC decides the card's photo slot** (S47; `has_photo` = `photo_ext is not null`). `webp` or `jpg` → sign `gift-photos/{gift_id}/view.{photo_ext}` on the client and render it; null → the sand band with the plate mark (A2), never an empty box. | Under C4 + S47 the flag is trustworthy by construction: it is the server's mark, stamped after both objects were checked — a gift with `photo_ext` set whose object is missing is a bug, not a state to design for. |
| C10 | **The arrival form shows the gift photo at the top, read-only** *(Dan, 2026-10-30; built `5619fe0`)*. Signed from `gift-photos/{gift_id}/view.{photo_ext}` as the card signs it, caption "Comes with the meal."; no menu, not editable; copied into `meal-photos` on Add as today; Not for us discards it; no photo → no slot. `.op-photo` + `.op-replay-block`, no name in any `aria-label`. | The receiver should see what they are adding before they add it; the card already showed it signed out. |
| C11 | **The giving place opens its own gift** *(Dan, 2026-10-30; 075 + `5619fe0`)*. When the target place is the gift's own giving household, the arrival shows "Already one of {Place}’s meals · Open it" (the source meal, while it still exists; else the line alone) instead of the form, and no copy is made. The server says so: `preview_meal_gift` returns `is_giving_place` (`from_household_id = p_household_id`) and, for the giving place only, `source_meal_id`; it never returns the household id. Checked BEFORE `already_added`. | A household cannot receive its own meal; the two same-place copies the walk made are the shape this stops. |

## Build order (one commit each, dev)

1. **Public card** — route `/g/{CODE}` for a signed-out visitor: `preview_meal_gift_public` → A1 / A2 / A3. "Add to our meals" → the 042 referral sign-up, code held per S33 (`sessionStorage`, clean Clerk `redirect_url`), resumed after bootstrap into the prefilled form. Photo `<img>` carries `.op-photo` + `.op-replay-block`; title masked; no name in any `aria-label`.
2. **Give sheet** — ~~⋯ → Give this meal~~ **the header share icon `.rv-give` (aria-label "Give this meal", beside Edit — Dan 2026-10-30, `9856cdd`; the ⋯ and its menu are gone) opens the sheet directly; "Stop giving" is the sheet's top line while any unrevoked gift exists**: B1/B2 (C1, C2), note ≤ 280, Give → B3 → B4 / B5 (C3, C4). Share payload per 10-07: text *"I'm giving you {meal} on OurProvisions."*, url `/g/{CODE}?ref={referral_code}`. Copy link always present. "Stop giving" ~~in ⋯~~ in the sheet's top line ("You’re giving this meal · Stop giving", same confirm) while any unrevoked gift exists → `revoke_meal_gifts`. **S48 (2026-10-30) rewrote C1's pre-check and the B1 / B2 copy — see the parent's Addendum 2026-10-30.**
3. **Accept** — signed-in `/g/{CODE}`: `preview_meal_gift(code, activePlaceId)` → prefilled New Meal form (10-07, with C6). Add to our meals → save → `record_meal_gift_receipt` (retry once, silent) → if `photo_ext`: download `gift-photos/{gift_id}/view.{photo_ext}` + `thumb.{photo_ext}`, upload them byte for byte under `{household}/{meal_id}/` in `meal-photos` with the same extension (S47), call `accept_gift_photo(gift_id, household_id, thumb_path, view_path, w, h)` (thumb first, per the 10-29 argument-order ruling). Photo failure here is silent beyond one toast; the meal is already theirs. Thank-you prompt once (S24).

## Verification (adds to the parent's V-list; run on dev with two accounts in two places)

- **V22** — HAR, 90-s foreground method, saved to `HAR Tests\`: 0 gift codes (path form), 0 `ref`, 0 `invite`, 0 `token=`, spans and replay, `documentLoad` span included.
- **V23** — after Stop giving, A3 shows and `createSignedUrl` on the gift path as `anon` is refused.
- **V24** — the receiver's row: `kind = showcase`, `uploaded_by` = giver, path under the receiver's folder.
- **V25** — `accept_gift_photo` from a place with no receipt raises `42501`, inserts nothing.
- **V26** — force the `view.{ext}` upload to fail (e.g. revoke the gift between `give_meal` and the upload, or block the request in DevTools): B5 shows, the gift previews with no photo, no retry.
- **V28 (open half)** — with the first real gift: an unknown 16-char code and the revoked gift's code return byte-identical empty results from `preview_meal_gift_public`.
- **V33 (new, C1)** — meal with cook photos only → B2; add a showcase photo in place → the sheet returns showing B1 without reopening.
- **V34 (new, C3)** — on iPhone, Send it opens the native share sheet; a single-tap variant (share called after the uploads) is the known failure this guards against — do not "simplify" it.
- **V35 (new, C6)** — a gift whose snapshot has empty `attribution` shows no From line on the card and no From field prefilled in the form.

## Not in this slice

- Lineage columns (S42, Phase B). The S37 sweep pass for `gift-photos`. Revoking gifts of a deleted meal (NEXT). Typed code entry (lean no, parent Open #2).
