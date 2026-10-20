# SPEC — Replay label close-out + Promotion 2 (recipe view slice (a) + Amendment A + 063)

*Design chat, 2026-10-19. For Claude Code. Build session.*
*Supersedes the sequencing in the 2026-10-18 Next-session block (see D1).*

---

## Why

Prod session replays still carry household data. `@splunk/otel-web-session-recorder` masks text and inputs but copies every attribute verbatim except `title`, `alt` and `on*`. The library was fixed on 2026-10-16 (`aria-labelledby`). On 2026-10-18 a read-only check of prod snapshots found **ten name-bearing `aria-label` templates** still being sent. Click events are clean. This is a privacy fix for real beta households, whatever the marketing calendar says.

Promotion 2 has been ready since its 2a pre-flight (2026-10-18, BASE dev `1a2a0c7`).

---

## Decisions

**D1 — One promotion, not two (changed from the 10-18 plan).**
The 10-18 plan was: cherry-pick the label fix onto `main` first, then run Promotion 2. That ordering existed to land the fix before Monday's blitz traffic. Dan cancelled the blitz on 10-18. Now:

- Build the fix on **dev** as ONE commit.
- **Promotion 2 carries it.** `src/` is taken whole from the new BASE, which includes the fix.

The result is one prod deploy, one bundle-proof pass and `main` that stays tree-identical with dev. A cherry-pick would leave `main`'s `src/` matching no dev commit.

The cost is that a Promotion 2 rollback also rolls back the fix. That's acceptable: the rollback target `8b595ae` already has the leak, so rolling back is no worse than today.

*Override:* if Promotion 2 stalls at any gate, the label commit can still be cherry-picked onto `main` alone. Report first.

**D2 — Fix recipe = the library's (2026-10-16).**
- `aria-labelledby` pointing at (a) a hidden `.sr-only` verb span placed **outside every button**, plus (b) the masked title element, identified by a content-free id (e.g. `meal-name-{uuid}`).
- Where no masked element exists to point at, use fixed copy (e.g. "Remove", "More options").
- Never use a name, count or item in any copied attribute.

**D3 — Sweep, don't just patch ten.**
The recorder copies **all** attributes (`aria-*`, `data-*`, `id`, `placeholder`, `name`, `value`, …). Grep `src/` for any JSX attribute that interpolates user data, other than `title` and `alt`. Report every hit by file and line. Fix the ten listed below, plus any new hits that are unambiguous. Bring anything ambiguous back to the design chat. Content-free ids (`meal-name-{uuid}`) are fine.

**D4 — 063 VERIFY expects `policies_unchanged = 3` on prod.**
The file's comment says 4. That comment is wrong: the pre-migration count is 3 on both databases. Don't edit the applied file. Record the correction.

**D5 — `open_rows` is read live, not taken from 2a.**
2a counted 15 open placements on prod. Households have planned since then. Count open placements immediately before applying 063 and expect that number back, with `open_unstamped = 0`.

---

## The ten templates (confirmed on prod snapshots 2026-10-18)

| # | Surface | Template |
|---|---|---|
| 1 | Plan board | `Remove {title}` |
| 2 | Plan board | `More for {meal}` |
| 3 | Plan board | `{meal} cooked` |
| 4 | Edit Meal ingredient row | `Need {item} again` |
| 5 | Edit Meal ingredient row | `Decrease {item}` |
| 6 | Edit Meal ingredient row | `Increase {item}` |
| 7 | Edit Meal ingredient row | `Remove {item}` |
| 8 | Edit Meal ingredient row | `I already have {item}…` |
| 9 | Edit Meal ingredient row | `{item} already added` |
| 10 | Places list | `Edit {household}` |

---

## Steps

### Step 0 — Orient (read-only)

- `git pull` on dev. Confirm the hash. Check that both Supabase MCP servers are bound (use Re-authenticate in `/mcp` if not).
- List `origin/dev..dev`. The 10-18 docs commit is local and rides the first push. Quote the range.
- Run the D3 sweep and report: the ten, plus anything else, by file and line, with a proposed fix per hit. **Stop for Dan's go if anything beyond the ten turns up.**

### Step 1 — The label fix on dev (ONE commit)

- Apply D2 to all ten, plus any approved D3 hits.
- **Accessible names must not change.** VoiceOver should read exactly what it reads today.
- **Tests:** follow `LibraryCards.test.js`. In a real DOM, prove that no copied attribute carries a name or count, and that `computeAccessibleName` gives the same names as before. Where a piece is inline in `App.js` and can't be rendered alone, either move it verbatim into a component (the library precedent) or explain why a bundle grep is the proof instead.
- `CHROME_ALLOW_LIST`: **expect no change** (`.sr-only` spans are never allow-listed). Report any change by name.
- ESLint 0, `CI=true` clean, LF line endings. Harness the board, Edit Meal and Places at 320 / 375 / 390, Default and XXL. Nothing should move visually.
- Push. Grep the dev bundle: all ten templates absent-after, against the dev bundle captured before.
- **Dan's dev check (short):** VoiceOver on one board card, one Edit Meal row and Places. Names unchanged. While on dev, the owed phone checks can ride along (not gating): V-A4a–c and V-A5b′.

### Step 2a′ — Re-scope (dev moved)

- New BASE = dev at the Step 1 commit (or later).
- Re-run the 2a scope against `origin/main` `8b595ae`. Report the file list. The only expected difference from 10-18's report is the label commit plus docs.
- Check `supabase/functions/meal-suggestion/` on `main` against dev. If `main` still has the v1 source, carry dev's as documentation: prod runs v2 (`dcde109`) regardless. **Report it; deploy nothing.**

### Step 2b — 063 on prod (Dan, SQL editor) before any client push

- Confirm prod by slug `parpauldmbetptkmdwbd` and `system_identifier` `7606130613603586966`. Confirm `planned_at` is absent.
- Read the live open-placement count (D5).
- Dan applies the whole file. Read back the VERIFY row: column present, `timestamptz`, nullable, no default, comment set, `open_rows` = the live count, `open_unstamped` 0, policies **3**.
- Read it back again over `supabase-prod-readonly`.
- **Safe stop:** the current prod client (`main.baddc262.js`) must run clean against the new column. Dan opens Plan on prod and checks the console is clean before Step 2c.

### Step 2c — Promote branch

- `promote/2026-10-19-recipe-view` from `origin/main`.
- Take whole from BASE: `src/`, `public/` (Playfair italic 500 in `index.html`), `migrations/063`.
- Docs, only: `docs/specs/active/SPEC_recipe_view.md`, `docs/mockups/mockup_recipe_view.html`, and this spec.
- `meal-suggestion/` as per Step 2a′.
- **Stay off `main`:** `.gitignore`, `CLAUDE.md`, `supabase/functions/recipe-import/prompt.ts`.
- `git diff <BASE> <branch> -- src/ public/` must be empty. `CI=true` clean. `origin/main..main` must be exactly ONE commit; quote the range.

### Step 2d — Bundle proofs (prod, against `main.baddc262.js` captured first)

1. `CHROME_ALLOW_LIST` goes **43 → 46** by name: in `.rv-edit`, `.rv-plan`, `.rv-showall`; nothing out. If the label fix changed the list, reconcile by name.
2. All ten templates **absent-after**. The library's `aria-labelledby` pattern is still present.
3. Privacy block and Splunk init are byte-identical to the old bundle.
4. The D9 pill order and the `planned_at` select + upsert are present.

### Step 2e — Dan's prod walk

- Open the recipe view from every door. Check the three tag states: In your cart, … bought it, Bought; "Last cooked {date}"; and "{n} left to buy · See list" / "+ Plan again".
- Re-plan a meal and check it keeps its position (`planned_at`).
- Board, Edit Meal and Places should be unchanged to the eye.
- Rollback if needed: `dpl_5q7pqE479jx4xycTtNpcVKC8JvYj` / `8b595ae`. 063 is additive and stays.

---

## Done when

- [ ] The D3 sweep is reported, and the ten (plus any approved hits) are fixed in one dev commit, with tests proving no name in any copied attribute and accessible names unchanged.
- [ ] 063 is on prod with VERIFY: live `open_rows`, `open_unstamped` 0, policies 3, read back over read-only. The safe stop passed.
- [ ] `main` has moved by exactly one tree-identity commit. Allow-list is 46 by name, all ten templates are absent-after, and the privacy block is byte-identical.
- [ ] Dan's prod walk passes.
- [ ] `SPEC_recipe_view.md` stays in `active/`, marked "slice (a) + Amendment A shipped; slices (b)–(e) pending". This spec moves to `built/`.

## Record at SESSION END (from the design chat, 2026-10-19 — ops, no code)

- **Key rotation CLOSED.** Proven by Console usage grouped by API key: the old prod key's last traffic was ~04:00 UTC 10-18; the new key's first was ~15:00 UTC 10-18 and it has been the only prod key since. The old dev key has had no usage since 10-17. Both old keys (`ourprovisions-prod-edge-fn`, `ourprovisions-dev-edge-fn`) were revoked on 2026-10-19. A prod Galley ask after revocation returned a full draft (Breakfast Tacos, 12 ingredients, 7 steps).
- **Finding:** the Console shows "—" for cost and last-used on service-account keys, which explains the 10-18 "Never used". To prove a rotation, use Usage grouped by API key, not the Keys page.
- **Bitwarden:** each key has one copy, in "Anthropic API key: Galley prod / dev". Both use the same layout (username, password = key, URI, note with project and expiry) with master password re-prompt on. The two "Supabase Secrets" notes now hold pointers, not values, with re-prompt on. The `.env.local (dev)` note holds no Anthropic key. There is no prod `.env.local`, by design (Vercel holds prod env).
- **NEXT:** move the dev Galley key to a service account named `ourprovisions-dev`, matching prod (dev's is currently user-linked, `sk-ant-usr`). One rotation: mint, swap the dev secret, prove by usage, revoke, then update the Bitwarden username.
- **LATER:** both Galley keys expire on 2027-10-17. Set a renewal reminder for about 2027-09.
- **ROADMAP wording:** remove "before blitz traffic" from the replay row. The blitz was cancelled 2026-10-18.

---

## Amendment A — 2026-10-19 (design chat: rulings on the Step 0 sweep)


*Design chat, 2026-10-19. Append to `SPEC_replay_labels_promotion2.md` under a dated heading; do not edit the body. Step 1 is GO with these rulings.*

---

## A1 — Casing: use the visible title

The label now points at the on-screen title, so the screen reader says what a sighted user sees: `displayTitle(title)`, as the library has done since 10-16. That's the right behaviour, not a regression.

**Tests compare exact strings, not case-insensitive.** The expected accessible name is built from the visible text (`displayTitle(title)`, the row's displayed name). That way the test still catches a dropped or reordered word, which a case-insensitive comparison would hide.

## A2 — #11 WrapUpBar counts: GO

- Label = the fixed word "Wrap up", plus `aria-labelledby` pointing at the bar's visible, masked count text.
- Don't add a hidden span if the counts are already on screen.
- Counts in **click text** stay as they are: `.wrapbar` is allow-listed for counts by the 10-05 decision. This change only removes them from the snapshot attribute.

## A3 — #12 `<option value>` category names: GO

These are household-authored names, so they count as household data.
- Use an index or a content-free key as the value, and map it back to `rawName` in the change handler.
- Prove with a test that the selected category saves exactly as before, including a custom category and a category whose name contains spaces or punctuation.

## A4 — #13 filter count: NO-GO (leave it)

How many filters are active is UI state, not household content. This refines D2's rule: **no names, items, or counts *of household content* in copied attributes.** A count of the household's meals, items or members is household content; a count of UI controls is not. Record the refined rule in ARCHITECTURE beside the replay finding.

## A5 — #14–16 photos: fix now, as a separate commit (Step 1b)

#14 is live on prod. A household's header photo is exposed through a signed link valid for an hour to anyone holding the replay. #15 is a stable link to the user's own photo. #16 isn't live yet but will have the same shape. Fix all three with **one rule rather than three patches**:

**Step 1b-0 (read-only, report before building):**
1. Does recorder 3.0.0 support a block / exclude selector (an rrweb-style `blockClass` / `blockSelector` or equivalent) in its config? Quote the source.
2. Does "collected as assets" mean the recorder **fetches and uploads the image bytes** to Splunk, or only records the URL? If it uploads bytes, the photo itself sits in Splunk, which raises the severity. Say which.

**Preferred fix:** a block rule in `rum.js` on one class, e.g. `.op-replay-block`.
- Add the class to the header photo layers (both sites), the avatar `img`, and the library's `cardPhotoUrl` `img`.
- A blocked element should replay as an empty box of the same size.
- One class keeps it in one place, and every future photo surface just adds the class.

**Fallback, only if no block option exists:** stop passing URLs into the DOM for those three. Fetch the image and render it from a `blob:` link, which is local-only, as your sweep already noted. Report the cost before building it.

**Commit and proof:**
- 1b is its own commit after the label commit, because it changes `rum.js`'s privacy config.
- **Change the spec's 2d proof #3:** the privacy block is no longer byte-identical. It is now the old block plus exactly the block rule, diffed and quoted.
- Grep the prod bundle for the block rule present-after, and the class present on all four sites.
- **Dan's check, on dev and then prod:** open one replay from after the change in Splunk (if the viewer loads; it's still subject to the CSP bug). The header and avatar should show as empty boxes. If the viewer doesn't load, the bundle proof plus the recorder-source quote from 1b-0 are enough.

**Carry-forward:** add one line to `SPEC_meal_photos_v1.md`, as a dated amendment: *"Every photo element carries `.op-replay-block`."*

## A6 — Order for today

1. Step 1, the labels: #1–12, one commit.
2. Step 1b-0 report, then 1b, the block rule: its own commit.
3. Dan's dev check: VoiceOver on board / Edit Meal / Places / the Wrap Up bar, plus a category pick that saves correctly.
4. Steps 2a′ → 2e as written. Promotion 2 carries both commits, still as one tree-identity commit on `main`.
