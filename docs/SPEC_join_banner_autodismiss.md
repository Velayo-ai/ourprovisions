# SPEC — Join banner auto-dismiss (timer + dismiss-on-switch)

Scope: OurProvisions

Intent: The "🎉 You joined X! Your list is now shared" banner (joinBanner state)
only dismisses on manual × click. Two problems: (1) a success confirmation
shouldn't require a manual close — it should self-clear on a timer; (2) if the
user switches to a DIFFERENT household, the banner becomes contradictory (header
shows the new household, banner still says "You joined <old>") and must clear
immediately. Observed live: joined Madbury, switched to NewLeaf, banner persisted
saying "You joined Madbury" while viewing NewLeaf. Data/sync confirmed correct —
this is purely a stale-banner display bug.

Fix: add TWO dismissal triggers to the existing joinBanner lifecycle, keeping the
manual × as a third path:
1. TIMER: when joinBanner becomes non-null, auto-clear after 5s.
2. DISMISS-ON-SWITCH: when the banner is showing AND the active household is no
   longer the joined one, clear immediately.

CORRECTNESS SUBTLETY (do not "simplify" this away): the banner appears BECAUSE of
the switch into the joined household, so a naive "clear on any activeHouseholdId
change" would race and clear the banner on the very arrival that should show it.
joinBanner holds the joined household's NAME. The correct condition is "clear when
the banner is showing and the current active household's name !== joinBanner" —
i.e. clear when the user has LEFT the joined household, not when they arrive.

## EDITS

NOTE TO IMPLEMENTER: the working tree is ahead of the spec author's snapshot
(tonight's four fixes are already applied). GREP CURRENT LINE NUMBERS before
editing — do not trust the line numbers below. Anchor strings:
- State decl: `const [joinBanner, setJoinBanner] = useState(null);`
- Banner set: `setJoinBanner(justJoined);`
- Render: `{joinBanner && (` ... `You joined <strong>{joinBanner}</strong>`

File: src/App.js

Add a single effect (place near the other top-level effects, after joinBanner is
declared and after the active-household value/name it reads is in scope). Use the
component's existing source of the active household name — confirm the correct
identifier by grepping (likely `household?.name` based on the banner effect's
existing guard `household.name !== "My Household"`).

ADD (adjust identifier for active household name to match current code):
```
// Auto-dismiss the join banner: on a timer (success confirmations self-clear),
// and immediately if the user switches away from the joined household (the
// banner would otherwise contradict the header). Guard on name inequality so we
// clear when the user has LEFT the joined household, not on the arrival switch
// that shows the banner in the first place.
useEffect(() => {
  if (!joinBanner) return;
  // Switched away from the joined household → stale, clear now.
  if (household?.name && household.name !== joinBanner) {
    setJoinBanner(null);
    return;
  }
  // Otherwise self-clear after 5s.
  const t = setTimeout(() => setJoinBanner(null), 5000);
  return () => clearTimeout(t);
}, [joinBanner, household?.name]);
```

If `household?.name` is NOT the right source for the currently-active household's
name at this point in the component, grep for the active-household value used by
the banner render/guard and use that instead — the logic is "active household
name !== joinBanner".

## DB
None.

## TEST
1. Push to dev, hard-refresh (Ctrl+Shift+R).
2. STAY-PUT / TIMER: TU (in another household) pastes an invite, lands in the
   joined household, banner shows. Do nothing. EXPECT: banner disappears on its
   own after ~5s. No × click needed.
3. DISMISS-ON-SWITCH (the reported bug): TU joins via invite (banner shows for the
   joined household), then switches to a DIFFERENT household before the timer
   elapses. EXPECT: banner clears immediately on switch; header and banner never
   contradict.
4. ARRIVAL RACE (correctness guard): confirm the banner DOES still appear when the
   join first lands the user in the joined household — it must not be cleared by
   its own arrival switch.
5. MANUAL ×: clicking × still dismisses immediately (unchanged).
6. Regression: a normal household switch with NO active joinBanner does nothing
   unexpected (no errors, no flicker).

## LOG_SEED
Join banner now auto-dismisses: 5s timer for the stay-put path, and immediate
clear when the user switches away from the joined household (was manual-× only,
causing a stale "You joined X" banner to persist over a different household's
view). Guarded against clearing on the arrival switch that shows the banner.
