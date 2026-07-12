# SPEC — Reset stale invite link on household change

Scope: OurProvisions

Intent: The "Share Your Household" panel displays a generated invite link held in
the `inviteUrl` state. `inviteUrl` is only cleared on panel close (×) or on panel
open — NOT when the active household changes. So after generating a link for
household A, then switching to (or creating) household B, the panel still shows
A's link. The user copies it believing it's for B; the invitee joins A.

Observed live: DH generates an invite on Test House 5 (code TYX5O9), then creates
Test House 6 (which auto-switches active context to Test House 6). The window
updates to Test House 6 but the share link still shows the Test House 5 code. A
user pasting that link joins Test House 5, not 6.

Note: createInvite (useProvisions.js ~914) is CORRECT — it reads the live active
household (householdRef.current) and generates a code for it. The bug is purely
that the displayed `inviteUrl` is stale state surviving an active-household
change. Resetting `inviteUrl` to null on household change makes the panel fall
back to the "Generate Invite Link" button, so the next generate produces a fresh
code for the current household.

This is the SAME class as the join-banner persistence bug: household-scoped UI
state not reset when the active household changes. Creating a new household
auto-switches active context, so a single reset keyed on the active household
covers BOTH switch and create paths — no separate create handling needed.

## EDITS

NOTE TO IMPLEMENTER: working tree is ahead of this snapshot (tonight's fixes are
applied) — GREP current line numbers; do not trust the ones below. Anchors:
- State decl: `const [inviteUrl, setInviteUrl] = useState(null);`
- The active household record is `household` (from useProvisions, destructured ~225);
  `household.id` / `household.name` identify it. Confirm by grep.

File: src/App.js

Add an effect that clears the stale invite link (and the copied flag) whenever the
active household changes. Place near the other top-level effects, after the
inviteUrl/inviteCopied state and the `household` value are in scope.

ADD:
```
// Reset the stale invite link when the active household changes (switch OR
// create-new, which auto-switches). The displayed inviteUrl is scoped to the
// household it was generated for; surviving a household change would let the
// user share the WRONG household's link. Clearing falls back to the "Generate
// Invite Link" button so the next link is fresh for the current household.
useEffect(() => {
  setInviteUrl(null);
  setInviteCopied(false);
}, [household?.id]);
```

(If `household?.id` is not the correct identifier for the active household at this
point, grep for the active-household id used elsewhere — e.g. activeHouseholdId —
and key the effect on that. The intent is "active household changed.")

## DB
None.

## TEST
1. Push to dev, hard-refresh (Ctrl+Shift+R).
2. SWITCH PATH: DH on household A clicks Generate Invite Link (link shows A's
   code). Switch to household B via the switcher. Open Share panel. EXPECT: no
   stale link — panel shows the "Generate Invite Link" button (or, after
   generating, a code for B). Paste-test: a freshly generated B link lands the
   invitee in B.
3. CREATE PATH (the reported sequence): DH on Test House 5 generates a link.
   Create a new household (Test House 6) — auto-switches to it. EXPECT: the share
   link is cleared, NOT showing Test House 5's code. Generate again → code is for
   Test House 6 → invitee joins Test House 6.
4. NO-CHANGE: generate a link, do NOT switch, copy it → still works (the effect
   only fires on household id change, not on generate/copy).
5. Regression: normal switching with the Share panel closed does nothing
   unexpected.

## LOG_SEED
Fixed stale invite link: the Share panel's inviteUrl now resets when the active
household changes (switch or create-new auto-switch), so users can no longer share
a prior household's invite link by mistake. createInvite was already correct; the
bug was household-scoped UI state surviving a household change — same class as the
join-banner persistence fix.
