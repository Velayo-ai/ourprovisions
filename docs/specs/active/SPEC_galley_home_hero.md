# SPEC — The Galley as Home's first-run hero

**Status:** Designed 2026-10-17 (design chat). Not built.
**Scope:** OurProvisions — Home tab, first-run path
**Mockup of record:** Claude Design canvas "Galley Home Hero" (two artboards: *New household* / *After 3 meals*). The middle state (1–2 meals) is defined in §3 but not drawn.
**Builds on:** `SPEC_home_v1_essentials.md` (Tonight "on deck" card, list line, budget line, live on prod), `SPEC_solo_start_experience.md` (welcome sheet), Ask the Galley (existing sheet + Edge Function).

---

## 1. The principle

> **Home shows what we can do until it can show what you've done.**

A new household has nothing of its own yet, so Home's job is to guide them, right away, into meal planning the Velayo way: say what sounds good, get a real meal, put it on deck, and the list fills itself. When their own meals exist, Home stops showing off our capability and puts *their* content first: tonight's meal, their list, their crew. The Galley stays within reach but never again leads.

This is the same "behavior before label" rule the welcome sheet and the earned-*Our* wordmark use: **the state comes from the household's data, never from a stored "onboarded" flag.**

## 2. The guided first run

One continuous path, no tour, no carousel:

1. **Welcome sheet** (unchanged): "What should we call your first place?" → Continue.
2. **Lands on Home with the Galley as hero.** Greeting is "Welcome aboard, {first name}." with the sub-line "Let's put your first meal in the Library."
3. **The Galley box**: same component as the existing sheet (text, camera, mic), rendered inline. Under it, three starter chips that fill the box and submit:
   - *Easy weeknight pasta*
   - *Paste a family recipe* (focuses the box with a paste hint; doesn't submit)
   - *Snap a recipe card* (opens the camera; **ship only if recipe import from photo is live on prod; otherwise swap for a third mood prompt**)
4. **Galley returns a meal card. On accept, the existing Ask the Galley behavior runs unchanged**: the meal lands in the Library, exactly as it does from any other Galley entry point. **No Home-only post-accept step.**
5. Home re-renders from data (§3). No "you're done!" screen.

**Consistency rule (decided 2026-10-17):** a meal created from Home behaves identically to one created from the Library. If beta shows people getting lost after a new meal "just goes into the Library", that gets fixed **once, for every new-meal path** (Galley from Home, Galley from Library, by hand), never as a Home-only patch. Watch for it in beta: a first meal created with no board add or list add within the session is the signal.

## 3. State rule (truth table)

`n` = count of the household's non-deleted meals in the Library.

| `n` | Top of Home | Galley | Tonight card | Rest |
|---|---|---|---|---|
| 0 | Greeting "Welcome aboard" + guiding sub-line | **Hero:** full box + 3 starter chips + one line: "Every meal you make here lands in your Library, and its ingredients go straight to your list." | **Hidden** (nothing to put on deck yet) | List line (empty → "Browse"), Invite card |
| 1–2 | Normal greeting + date | **Full box, second position**, directly under Tonight. Chips swap to "Another idea?" variants | **Shown, first**: their meal leads as soon as it exists | List line, budget line, Invite card |
| ≥ 3 | Normal greeting + date | **Compact row**: one-line input + mic, under Tonight | Shown, first (all v1 essentials states) | List line, budget, crew activity (if > 1 member), Jump back in |

Notes:
- **Joining an existing crew** (invite path) with ≥ 3 meals: goes straight to the ≥ 3 layout. Correct by data, no special case.
- **Falling back below 3** (meals deleted): the layout follows the data. Accepted; it's rare and harmless. Revisit only if beta shows it reads as a regression.
- Threshold **3** is a constant (`GALLEY_HERO_GRADUATE_AT = 3`), named so beta feedback can move it with a one-line change.
- **"AI" never appears** in any of this copy. It is the Galley.

## 4. Prerequisites and ordering (the risk)

1. **Deferred catalog write fix (`SPEC_defer_catalog_write.md`) ships first, or together.** New users experiment and reject meals. Today every rejection leaves orphaned `catalog_items` rows. Putting the Galley first on Home multiplies that.
2. **Per-household rate limit on the Galley Edge Function.** The hero invites experimentation from people we don't know yet. Builder's choice of mechanism; record the limit chosen.
3. **Confirm on prod** that the Galley path is fully live (Edge Function, `ANTHROPIC_API_KEY`, `CLERK_ISSUER`, `insert_custom_catalog_item` unit param) **by running it from the prod app**, not by reading config.
4. The Home hero must **reuse the existing Galley flow** (same component and accept path), never a fork, so the consistency rule in §2 holds by construction.

## 5. Out of scope

- A product tour or tooltips. The Galley *is* the onboarding.
- Changing the welcome sheet.
- Any stored onboarding flag or "dismiss hero" setting.
- Galley observability (`SPEC_galley_agent_observability.md`), but the first-run path is the obvious first trace to instrument once it exists.

## 6. Verification

1. **New bare signup on dev:** welcome sheet → Home shows the hero, **no** Tonight card, greeting "Welcome aboard".
2. **Each chip:** pasta submits; paste focuses without submitting; camera opens (or the chip is absent per §2.3).
3. **Accept a meal from the Home hero:** the outcome matches accepting the same meal from the Library's Galley exactly: same rows written (read `meals` back, not just the 2xx), no board row, no extra prompt.
4. **Same code path:** the Home hero and the Library's Galley call the same accept handler (grep, not assumed).
5. **n = 1:** Tonight card is first, the full Galley box is second.
6. **n = 3:** the Galley collapses to the compact row; voice still works from it.
7. **Reject a Galley meal:** zero new orphaned `catalog_items` rows (depends on §4.1).
8. **Invite-join into a household with ≥ 3 meals:** never sees the hero.
9. **Delete back to n = 2:** the layout follows the data without a refresh.
10. **Grep the rendered Home:** the string "AI" does not appear.
