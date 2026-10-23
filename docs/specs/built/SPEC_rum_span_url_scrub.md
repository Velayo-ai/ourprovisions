# SPEC — RUM span URL scrub (signed storage URLs and photo paths out of Splunk spans)

*Design chat, 2026-10-21. Status: APPROVED for build on dev. Client-only (`src/rum.js` + `src/rum.test.js`). Promote ALONE to prod, BEFORE the Meal Photos v1 promotion.*

## Why

The 2026-10-21 HAR check on dev (Claude Code's report) found the replay pipeline clean, but the **RUM spans exporter** is sending photo URLs to Splunk:

- **24 resource-timing spans** (`resourceFetch`, `splunk-post-doc-load-resource`) carry full signed storage URLs, **token included**, in `http.url`. Example shape: `https://<dev-ref>.supabase.co/storage/v1/object/sign/meal-photos/<household>/<meal>/<photo>-thumb.jpg?token=…`
- **14 fetch spans** (`HTTP POST`, component `fetch`) carry storage object paths without a token, including both photos uploaded during the walk.
- One `household-photos/…/header.jpg` signed URL — the **Home banner, which is live on prod**, so prod is very likely sending banner tokens to Splunk today (unverified).
- Two `img.clerk.com` avatar URLs — a stable public link to a person's picture.

The cause is a decision we made on purpose and now reverse: `scrubUrlAttributes` (`src/rum.js` ~107–114) strips query strings **only on our own origin**, on the reasoning that another origin's query (a Supabase REST filter) is debugging data, not personal data. A signed storage URL breaks that assumption: its query is a **live credential** (valid ~1 hour) and its path names a household's photo.

No DOM element is involved, so `.op-replay-block` cannot help. This is the exporter hook's job.

## Principle (new)

**A URL's query is a secret until proven a filter.** URL attributes lose their query everywhere except on paths we have named as filter-bearing. Photo paths keep only enough to say *which bucket*, never *which object*.

## Decisions

- **D1 — Invert the query rule.** Every URL attribute in the covered set loses its query string on **every origin**. The one exception is **Supabase REST, `/rest/v1/`, on the dev and prod project hosts**: there the query is the PostgREST filter, and it stays (it is what makes a slow-query span readable). Nothing else is excepted. Edge Functions (`/functions/v1/`) get no exception.
- **D2 — Fragments.** Our own origin keeps its hash (it is the route, as today). Every other origin loses its fragment too: tokens travel in fragments in some auth flows.
- **D3 — Storage paths stop at the bucket.** Any path containing `/storage/v1/object/` keeps the operation segment if there is one (`sign`, `public`, `authenticated`, `upload/sign`, `info`, whatever the run actually showed) plus the bucket, and the rest of the path becomes the literal `[object]`. Result: `https://<ref>.supabase.co/storage/v1/object/sign/meal-photos/[object]`. Claude Code confirms the full list of storage path shapes from the run and covers each one by a test case. The span still tells us storage latency per bucket; it never names a household, meal or photo.
- **D4 — Clerk images become origin only.** `img.clerk.com` (and any other Clerk image host seen) → `https://img.clerk.com/[object]`.
- **D5 — Same attribute set, proven complete.** The hook keeps its key set (`location.href`, `http.url`, `document.referrer`, any key ending `.url`). Before building, Claude Code lists **every span attribute and span name** in the run that held a storage path, a token or a Clerk image URL. If anything outside that set carried one, report it and stop: that is a design question, not a quiet addition.
- **D6 — Unparseable values.** If a value fails `new URL()` and contains `?`, drop everything from the `?`. Never return an unparsed string with a query intact.
- **D7 — Order.** This ships to prod **alone and first** (client-only, `rum.js`), because the banner leak is likely live on prod now. Meal Photos v1 promotes only after this is on prod and the re-run check below passes.
- **D8 — Past spans.** No purge request, consistent with tonight's beta-scope decision: the tokens already sent were valid for about an hour; the beta is small and trusted.

## Build (dev)

1. `src/rum.js`: rewrite `scrubUrlAttributes` / its helper per D1–D6. Keep the existing comment block's history and replace the "other origins are untouched on purpose" paragraph with the new principle and a dated note.
2. `src/rum.test.js`: pin every rule with literal cases:
   - signed storage URL with `?token=` → no query, path cut at the bucket, `[object]`;
   - each other storage path shape from the run (upload, public, plain object);
   - Supabase REST `/rest/v1/...?select=...&household_id=eq....` → **unchanged**;
   - own origin with query and hash → query dropped, hash kept (today's behaviour);
   - `img.clerk.com/...` → origin + `[object]`;
   - an arbitrary third-party URL with `?token=` and a `#fragment` → both dropped;
   - an unparseable string with `?` → cut at `?`.
3. ESLint `--max-warnings=0`, `CI=true` build, LF. `CHROME_ALLOW_LIST` and both rule arrays unchanged (report by name).

## Verification

- **V1 — Re-run the HAR check on dev, both pipelines, all nine surfaces:** Home banner, avatar, desktop backdrop, library card, recipe hero, full-screen viewer, photo editor preview, Cooked-it afterglow add, Galley with 2 staged screenshots. Dan pauses ~10 s on each surface and ~30 s at the end.
- **V2 — Prove the capture is complete before judging it.** Claude Code first lists every Splunk request with no saved body and its `request.bodySize`. Last run's 55-second hole (11 replay POSTs, 03:15:16 → 03:16:06 UTC) lined up with the Galley step, which is exactly when the recorder would have uploaded image bytes if the exclude were missing. **Any bodyless replay POST fails the capture, not the check:** re-capture with `chrome://net-export` and "Include raw bytes" (or a fresh HAR) before any verdict.
- **V3 — Pass:** zero hits in **both** pipelines for `token=`, `blob:`, `data:image`, any photo filename, and any storage path beyond the bucket; zero `img.clerk.com` paths; storage spans present and reading `…/<bucket>/[object]`; `isExcluded` size-only nodes seen for **all nine surfaces**, including the afterglow thumbnail and the Galley thumbnails.
- **V4 — REST still readable:** at least one `/rest/v1/` span keeps its query unchanged.
- **V5 — Read-only audit, report only:** list the distinct query parameter keys in the kept `/rest/v1/` spans and say whether any value is user-entered text (a search term, an item or meal name). If yes, that is a separate decision for the design chat; do not widen this change.
- **V6 — Prod, after the promotion:** bundle proof (the new rule present by a literal marker, absent before), then Dan captures a short prod HAR on Home only. The banner's span reads `…/household-photos/[object]` with no token.
- **V7 — Delete every HAR and decoded dump after reading.** They hold signed URLs and session tokens. Never commit them.

## Out of scope

- Splunk-side retention/purge (D8).
- Shortening signed-URL lifetimes (a mitigation, not a fix).
- The three walk photos left in dev storage (`ed6b8003…`, `46f478ac…`, `c6d72d72…`): clear them with the rest of the Madbury walk data at the Meal Photos promotion.

## Addendum 2026-10-21 (late) — replay half CLOSED; storage shapes confirmed

- **Replay passes V2 + V3 for the Galley and the afterglow** (two fresh HARs, every Splunk body saved, no gap over 20 s). The Galley thumbnails replay as `isExcluded` at 46.4×62.4 (staged, removed, re-staged — every one hidden), the afterglow thumbnail at 32×32. Replay assets: stylesheet, Google Fonts, splash only — **no image uploads; the `blob:` screenshots were never downloaded.** Last run's 55-second hole was a capture gap, not a leak. The full nine-surface run in one capture still belongs to V1 after the build.
- **D5 confirmed:** only `http.url` carried a storage path or token, on two span types (`resourceFetch` / `splunk-post-doc-load-resource` and `HTTP POST` / `fetch`). The hook's attribute set is complete; the build is not stopped.
- **D3's four shapes, each a test case:** `GET /storage/v1/object/sign/<bucket>/<path>?token=…`; `POST /storage/v1/object/sign/<bucket>` (bucket only — leave as is, minus any query); `POST /storage/v1/object/sign/household-photos/<path>`; `POST /storage/v1/object/<bucket>/<path>` — **the upload, with no operation segment**: the cut still lands after the bucket.
- **2026-10-22 — D3 widened (design chat ruling, before the V1 capture):** the cut fires on **any** `/storage/v1/` route, not only `/storage/v1/object/` — `object`, `render/image`, and anything else under `/storage/v1/`. A recognised route keeps route + operation + bucket; otherwise the cut lands at the first segment after the route, and everything after becomes `[object]` (fails closed). E.g. `/storage/v1/render/image/sign/meal-photos/<h>/<m>/a.jpg?token=…` → `/storage/v1/render/image/sign/meal-photos/[object]`; an unknown operation → `…/object/<first segment>/[object]`.
- **2026-10-22 — Clerk id masked in kept REST queries (design chat ruling, no spec; dev only, rides the Meal Photos v1 promotion):** V1 showed `users?clerk_id=eq.user_…` and `user_hidden_items?clerk_id=eq.…` in kept `/rest/v1/` span queries, against D2's "without a Clerk id or email leaving the app". The value of any `clerk_id=` filter (also `<table>.clerk_id=`) becomes `[clerk]`, operator kept, whatever it is — `users?clerk_id=eq.[clerk]`, `in.[clerk]`, `not.eq.[clerk]`. Every other byte of the REST query is unchanged.
