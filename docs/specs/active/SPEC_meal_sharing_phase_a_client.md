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
| C4 | **Any partial photo upload is a failure.** Upload `view.webp` first, then `thumb.webp`, both without `upsert` (S41). If either fails, the client shows B5 ("The photo didn't attach."), the gift ships with no photo, and the client does not retry or delete. | `preview_meal_gift_public` stays pure SQL and never reads storage. View-first means a failure most often leaves nothing behind; a stray `thumb.webp` is harmless (the card signs `view.webp` only) and the S37 sweep can collect it later. |
| C5 | **The public card shows the five S43 fields and nothing else.** No giver name, no note. The note appears only in the signed-in prefilled form (10-07). | A bearer link can reach anyone; the note is the giver's words to one person. |
| C6 | **No From line when `attribution` is empty.** Both the public card and the prefilled form omit it; no placeholder. | "Never show state the data doesn't support." The two surfaces must match. |
| C7 | **One screen for unknown and revoked codes, signed out (A3).** "That link doesn't work. Ask whoever sent it for a new one." The 10-07 "Andrew stopped giving this one" line survives only for signed-in recipients, where `preview_meal_gift` raises `55000`. | `preview_meal_gift_public` returns the same empty result for both (S43), so the page can't tell them apart either. |
| C8 | **`has_photo` from the RPC decides the card's photo slot.** `true` → sign `gift-photos/{gift_id}/view.webp` on the client and render it; `false` → the sand band with the plate mark (A2), never an empty box. | Under C4 the flag is trustworthy: a gift with `has_photo = true` whose object is missing is a bug, not a state to design for. |

## Build order (one commit each, dev)

1. **Public card** — route `/g/{CODE}` for a signed-out visitor: `preview_meal_gift_public` → A1 / A2 / A3. "Add to our meals" → the 042 referral sign-up, code held per S33 (`sessionStorage`, clean Clerk `redirect_url`), resumed after bootstrap into the prefilled form. Photo `<img>` carries `.op-photo` + `.op-replay-block`; title masked; no name in any `aria-label`.
2. **Give sheet** — ⋯ → Give this meal: B1/B2 (C1, C2), note ≤ 280, Give → B3 → B4 / B5 (C3, C4). Share payload per 10-07: text *"I'm giving you {meal} on OurProvisions."*, url `/g/{CODE}?ref={referral_code}`. Copy link always present. "Stop giving" in ⋯ while any unrevoked gift exists → `revoke_meal_gifts`.
3. **Accept** — signed-in `/g/{CODE}`: `preview_meal_gift(code, activePlaceId)` → prefilled New Meal form (10-07, with C6). Add to our meals → save → `record_meal_gift_receipt` (retry once, silent) → if `has_photo`: download `gift-photos/{gift_id}/view.webp` + `thumb.webp`, upload under `{household}/{meal_id}/` in `meal-photos`, call `accept_gift_photo(gift_id, household_id, thumb_path, view_path, w, h)` (thumb first, per the 10-29 argument-order ruling). Photo failure here is silent beyond one toast; the meal is already theirs. Thank-you prompt once (S24).

## Verification (adds to the parent's V-list; run on dev with two accounts in two places)

- **V22** — HAR, 90-s foreground method, saved to `HAR Tests\`: 0 gift codes (path form), 0 `ref`, 0 `invite`, 0 `token=`, spans and replay, `documentLoad` span included.
- **V23** — after Stop giving, A3 shows and `createSignedUrl` on the gift path as `anon` is refused.
- **V24** — the receiver's row: `kind = showcase`, `uploaded_by` = giver, path under the receiver's folder.
- **V25** — `accept_gift_photo` from a place with no receipt raises `42501`, inserts nothing.
- **V26** — force the `view.webp` upload to fail (e.g. revoke the gift between `give_meal` and the upload, or block the request in DevTools): B5 shows, the gift previews with no photo, no retry.
- **V28 (open half)** — with the first real gift: an unknown 16-char code and the revoked gift's code return byte-identical empty results from `preview_meal_gift_public`.
- **V33 (new, C1)** — meal with cook photos only → B2; add a showcase photo in place → the sheet returns showing B1 without reopening.
- **V34 (new, C3)** — on iPhone, Send it opens the native share sheet; a single-tap variant (share called after the uploads) is the known failure this guards against — do not "simplify" it.
- **V35 (new, C6)** — a gift whose snapshot has empty `attribution` shows no From line on the card and no From field prefilled in the form.

## Not in this slice

- Lineage columns (S42, Phase B). The S37 sweep pass for `gift-photos`. Revoking gifts of a deleted meal (NEXT). Typed code entry (lean no, parent Open #2).
