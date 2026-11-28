Reported: 2026-11-27 22:10 ET · dev 36d197b · main e93b265 · re: Meals search row = List feeder's; push exp/one-add; confirm the preview rebuilt · prompt: none (asked directly in Claude Code)

# exp/one-add is pushed and the preview has rebuilt from the new head, f656b54. dev and main are unchanged.

**New head:** `exp/one-add` = `f656b54`
**Preview:** https://ourprovisions-git-exp-one-add-dan-valeyos-projects.vercel.app
- **Bundle:** `main.ca2554b3.js` (deployment `dpl_DPRmxpf3Mgbcb8zMCykgHr4RCZdW`, READY, built from `f656b54`)
- **Build tag on the alias:** "dev · f656b54", read off the loaded page. The page's script is `main.ca2554b3.js`, and the marker is `op-one-add:on`.
- **The bundle contains:** the full sha, `op-one-add:on`, the dev Supabase ref, the desktop-frame rule, "What do we need?", and the new Meals search-row CSS.

## The new commit: `f656b54`, the Meals search row matches the List feeder's (flag on only)
- **Field:** 52px white field, radius 16, sand border, 18px glass, 17px text, and the List's focus border.
- **Tool buttons:** grid/list and filter at 46px, radius 14, 12px from the field.
- **Read back equal to the List feeder's** on a local flag-on build: field 52 / r16 / #d8bf94 / white, text 17px, glass 18px, tools 46×46 r14, gap 12. I checked this with the meals reads faked in the harness tab only; nothing was written to dev.
- Flag off is unchanged.

## Pushed (exp/one-add only, 0e84a89 → f656b54)
- `9f3098d` harness: oneadd-nav (Got it on the welcome, DOM clicks)
- `2a78f70` One results title: "This Week" and "Our list" share one style (flag on)
- `60b4c4c` The Meals feeder matches the List feeder's chrome (flag on)
- `7921254` Item search layer inside the desktop phone frame (not flagged; a bug fix)
- `f656b54` The Meals search row matches the List feeder's (flag on)

The pre-push range `origin/exp/one-add..exp/one-add` was exactly these five commits.

## dev / main (git ls-remote)
- **Before:** dev `36d197b`, main `e93b265`
- **After:** dev `36d197b`, main `e93b265`. Both are unchanged.

## Jest
- 1388/1388 with the flag off.
- 1388/1388 with the flag on (ASK + ONE_ADD).

## Not done, by your instruction
- **`7921254` is not on dev.** The cherry-pick waits for your iPhone check of the keyboard on the first tap and the viewport follow, on this preview.
