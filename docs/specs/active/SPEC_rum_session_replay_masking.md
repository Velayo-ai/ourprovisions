# SPEC: RUM session replay — restore Clerk exclusion, mask by environment

## Status
Ready to execute. Two changes bundled here because both touch the same `SplunkSessionRecorder.init`
call in `src/rum.js`, but they are not equally optional — read the priority note before merging.

## Background
Current `src/rum.js` (uncommitted, local-only) has `maskAllInputs: false` and `maskAllText: false`
set globally, with the entire `sensitivityRules` array commented out. This was left in place from
debugging session-replay masking behavior; Brad (Cisco, Observability Cloud SME) separately
recommended keeping inputs unmasked during active testing because seeing exactly what beta users
type is useful right now for catching real usage problems.

Two separate things are true at once here:

1. **The commented-out `sensitivityRules` block included the Clerk-exclusion rules.** The comment
   directly above the `init()` call still says "mask ALL inputs globally and exclude the Clerk auth
   modal" — but the code no longer does either. With the rules commented out, Clerk's auth UI
   (login, password entry, MFA/OTP) is not excluded from session recording. This is a materially
   different and higher-severity gap than "can see what people type in meal notes" — it was
   evidently a side effect of isolating a debugging question, not a deliberate choice, and should
   be fixed regardless of what's decided about masking generally.

2. **Whether to unmask ordinary app inputs (grocery lists, meal notes, budget fields) is a real,
   separate decision.** Beta users are real people — household members and friends/family — who
   have not been told session replay may capture literal keystrokes. Dan's beta group is different
   from an anonymous prod user base in a way that's worth being deliberate about, but the debugging
   value Brad described is real too, particularly for the still-unstable meal-suggestion feature.

## Decision
Split masking behavior by `deploymentEnvironment`, driven by the existing `REACT_APP_DEPLOY_ENV`
env var already read into `deployEnv`:

- **Dev**: inputs and text stay unmasked (`maskAllInputs: false`, `maskAllText: false`) — full
  debugging value where the audience is Dan and any dev-preview testers who understand this is a
  non-production, actively-instrumented environment.
- **Prod**: inputs and text stay masked (`maskAllInputs: true`, `maskAllText: true`) — the real
  beta household/friends-and-family users get the conservative default. No literal keystrokes
  recorded in prod session replay.
- **Clerk exclusion is unconditional in both environments** — this is not an environment-dependent
  choice, it's a floor that should never be off, debugging or not.

This directly answers Dan's question ("could we mask prod but not dev fields") — yes, and it's a
small conditional rather than two separate config blocks to maintain.

## Change

Replace the `SplunkSessionRecorder.init` block in `src/rum.js`:

```js
const isProd = deployEnv === 'production'; // CONFIRM: exact string REACT_APP_DEPLOY_ENV
                                            // is set to for prod in Vercel — see note below

SplunkSessionRecorder.init({
  realm: 'us1',
  rumAccessToken: rumToken,
  maskAllInputs: isProd,
  maskAllText: isProd,
  sensitivityRules: [
    { rule: 'unmask', selector: 'body' },
    { rule: 'exclude', selector: '[class*="cl-"]' },
    { rule: 'exclude', selector: '#clerk-components' },
  ],
});
```

Update the comment above the block to describe the actual current behavior (environment-
conditional masking, Clerk always excluded), so the next person reading it isn't misled the way
this session's comment was.

## Open item — confirm before merging
The exact string `REACT_APP_DEPLOY_ENV` is set to for the prod deployment (Vercel env vars) needs
confirming — this spec assumes `'production'` but has not verified it against the actual Vercel
project settings. If the real value differs (e.g. `'prod'`), `isProd` will silently evaluate false
in prod and mask nothing there, which is the one failure mode that actually matters here — it
would produce the opposite of the intended behavior with no visible error. Verify the exact string
in Vercel's environment variables for the `main` branch/production deployment before merging, and
adjust the comparison to match exactly.

## Priority
The Clerk-exclusion restoration is not optional and not tied to the environment-masking decision —
merge it regardless of how the environment-conditional piece resolves. If there's any reason to
ship the Clerk fix alone first (e.g. the `REACT_APP_DEPLOY_ENV` value can't be confirmed quickly),
do that as its own small commit rather than waiting.

## Verification
- [ ] Confirm `REACT_APP_DEPLOY_ENV` value for prod in Vercel settings
- [ ] Deploy to dev preview, open a session replay, confirm Clerk sign-in UI is NOT visible/
      recorded (test by actually going through a sign-in flow in that session)
- [ ] Confirm dev preview session replay still shows unmasked grocery/meal inputs as before
- [ ] Deploy to prod, confirm a prod session replay shows masked input fields (dots/redaction)
      and Clerk UI still excluded
- [ ] Note in ROADMAP or CLAUDE.md that this masking split exists and why, so nobody "cleans up"
      the conditional back to a single global setting later without knowing it's deliberate

## Scope note
This is `OurProvisions` scope (product code, `src/rum.js`), not Velayo OS — unlike most of today's
session, this one goes through the normal dev-preview verification and dev→main promotion path
like any other code change, not a platform/infra change.
