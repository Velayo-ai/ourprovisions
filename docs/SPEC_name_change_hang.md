# SPEC — Fix name-change hang (Effect 1 dependency loop)

Scope: OurProvisions
Intent: Editing a display name hangs the app on "LOADING YOUR PROVISIONS…".
Root cause: the name-save path writes the name to Clerk (`user.update`), which
changes Clerk's `fullName`. `fullName` is in the dependency array of Effect 1
(session bootstrap) in useProvisions.js, so the name edit re-triggers Effect 1,
which calls setLoading(true) — but Effect 1 only clears loading on FAILURE; the
success-path setLoading(false) is owned by Effect 2, which does NOT re-run
(activeHouseholdId unchanged). Result: loading state never clears → hang until
manual page refresh. The Supabase name write itself succeeds (name saves); the
Clerk write is what perturbs Effect 1.

Fix: remove `fullName` from Effect 1's dependency array. Effect 1 is session
bootstrap and should re-run on IDENTITY change (userId/clerkId/email), not on a
cosmetic display-name change. `fullName` is read inside Effect 1 only at line
~274 (`p_full_name: fullName || null`) which feeds `bootstrap_new_user` — a no-op
for existing users, so the fresh value is only needed on first-signup, where it
arrives on the initial run regardless of dep-array membership. Keeping the Clerk
write means Clerk's name stays accurate (useful for Clerk transactional emails
and correcting signup typos); only the harmful re-trigger is removed.

## EDITS

File: src/useProvisions.js

OLD:
    setupSession();
  }, [userId, clerkId, email, fullName]);
NEW:
    setupSession();
    // fullName intentionally excluded: it is a cosmetic attribute that feeds
    // bootstrap_new_user (no-op for existing users) only. Including it caused a
    // name edit (which writes Clerk → changes fullName) to re-fire session
    // bootstrap and wedge the loading state. Bootstrap re-runs on identity
    // change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, clerkId, email]);

## DB
None.

## TEST
1. Push to dev, hard-refresh (Ctrl+Shift+R) the dev preview to clear stale JS.
2. Sign in as a test account (e.g. TU). Edit the display name in the profile sheet, blur/Enter to save.
3. Expect: NO hang. App stays interactive; no "LOADING YOUR PROVISIONS…" freeze.
4. Confirm the name DID save: reopen profile sheet — new name shows. Open another
   account (DH), open Manage Households → the new name appears (via refresh-on-open).
5. Regression check — first-signup name capture: create a brand-new test user WITH
   a name at signup; confirm their full_name lands in Supabase users row (bootstrap
   still passes p_full_name on first run).
6. Regression check — session still bootstraps normally on fresh sign-in (the
   removed dep shouldn't affect identity-driven setup).

## LOG_SEED
Fixed name-change hang: removed cosmetic `fullName` from Effect 1 (session
bootstrap) dependency array in useProvisions.js, so a Clerk name write no longer
re-fires bootstrap and wedges the loading state. Clerk write retained for name
accuracy; root cause was the dependency loop, not the write itself.
