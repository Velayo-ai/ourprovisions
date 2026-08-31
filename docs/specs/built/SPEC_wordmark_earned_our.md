# SPEC_wordmark_earned_our.md
2026-08-24 · OurProvisions · Reverses §8 (splash→header wordmark handoff)

## Decision
Reinstate the earned-Our wordmark (ROADMAP 2026-06-17), superseding §8's always-"OurProvisions" header. The splash-to-header wordmark travel/clone was a lovely mechanic that cost a brand mechanic with real meaning: the *Our* arrives with the second person. Field evidence (2026-08-24, first external testers): the always-Our header made a correct solo-signup state read as "this stranger is in my household." The wordmark is both brand and diagnostic.

## Behavior (truth table)
| Condition | Header wordmark |
| --- | --- |
| Signed out | Provisions |
| Signed in, membership for active household still loading | Provisions |
| Active household has 1 member | Provisions |
| Active household has 2+ members | OurProvisions (*Our* fades in) |
| Switch to a household with different member count | Re-evaluates; fades accordingly |

Default is **Provisions** in every unknown state — behavior-before-label: never claim *Our* until the data supports it. The *Our* transition is an opacity fade (no text swap → no layout shift). Fade-in when 2+ resolves; fade-out on switching to a solo household.

Source of truth: `householdMembers.length` for the **active** household (Effect 2 already reloads this per active household). No new state, no new queries.

## Splash
- Splash wordmark still reads the full **OurProvisions** — it is the app's name and a brand surface, independent of any household.
- **Delete** the travel/clone handoff machinery: the splash-clone that travels to and holds on the header position, the `headerTitleRef` measurement target usage for that purpose, and the `opacity: showSplash ? 0 : …` gating that hides the real header wordmark during the splash. Splash finishes and unmounts; header renders independently.
- The header title remains a button opening the household sheet whenever signed in (unchanged — tappability stays decoupled from member count, per Jun 17 decision).

## Out of scope
- First-run naming moment / invite-code entry / share verbs (next design session).
- Any change to household data, membership logic, or the sheet.

## Verification (dev preview, deployed — not localhost)
1. Sign in with a solo household active → header reads **Provisions**; no flash of "OurProvisions" during load.
2. Switch to a 2+-member household → *Our* fades in; switch back → fades out.
3. Reload on a 2+ household → brief Provisions during membership load, then *Our* fades in (acceptable; never the reverse).
4. Splash plays and exits cleanly; no doubled wordmark, no dead clone left in DOM.
5. Signed out landing → **Provisions**.

## Why a spec
Reverses a documented decision (§8) and carries a truth table + deletion of nontrivial animation machinery a future session would otherwise puzzle over.
