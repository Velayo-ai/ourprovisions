# SPEC — Fix RUM session-replay masking (silent key-name bug)

**Scope:** OurProvisions
**Touches prod:** Yes — real-user session recording (Helen, Elly on prod)
**File:** `src/rum.js`
**Type:** One-word fix, repeated 5×. Single scoped commit.

---

## Problem

Splunk session replays come back **fully masked (all grey)** on prod, despite
`src/rum.js` intending to unmask the grocery UI. Commit `1037e52` logged the
intent as "unmask UI, mask inputs, exclude Clerk auth" — but the replays never
unmasked.

## Root cause

The `sensitivityRules` objects use the key **`type`**. The Splunk session
recorder API expects **`rule`**:

```
{ rule: 'mask' | 'unmask' | 'exclude', selector: '<css selector>' }
```

Because the recorder reads a `rule` property that does not exist on our objects,
**every rule is silently skipped** (invalid rules throw no error — they are
just ignored). With no valid rules, the recorder falls back to its
**privacy-first default: mask everything.** That is the all-grey replay.

The selector *strategy* was always correct — unmask `body`, mask
`input`/`textarea`, exclude Clerk. Only the key name is wrong.

## Fix

In `src/rum.js`, in the `SplunkSessionRecorder.init` call, change `type:` to
`rule:` on all five `sensitivityRules` entries. Change nothing else.

```javascript
    sensitivityRules: [
      { rule: 'unmask', selector: 'body' },
      { rule: 'mask', selector: 'input' },
      { rule: 'mask', selector: 'textarea' },
      { rule: 'exclude', selector: '[class*="cl-"]' },
      { rule: 'exclude', selector: '#clerk-components' },
    ],
```

**Grep-before-edit anchor:** grep `src/rum.js` for `type: 'unmask'` to confirm
the block still matches before editing (line numbers may have drifted).

## Verification (the point of the spec — do not skip)

Dev-preview first, then prod:
1. Deploy to dev preview. Run a short session (browse + add/remove an item).
2. Open the replay in Splunk. **Confirm:** grocery UI text is now READABLE
   (unmasked); `input`/`textarea` contents stay MASKED; the Clerk sign-in
   modal is EXCLUDED (not recorded at all).
3. If all three hold on dev, promote to prod and re-verify one live session.

If replay is still masked after the fix: check whether masking is *also* set in
the Splunk Controller UI (Configuration → Instrumentation → Session Replay),
which would override code.

## Known follow-up (NOT in this commit — flagged, not fixed)

`unmask: body` makes ALL rendered text visible, but only `input`/`textarea` are
masked. Emails / account identifiers rendered as plain text (member lists,
profile headers) will be visible in replay. Given real users on prod, add a
`mask` rule for those surfaces once the class names are confirmed. Queued as a
wait-until-we-look follow-up — does not block this fix.

## Why this matters now

This unblocks the P0 banner-leak hunt: an unmasked replay of a real
staple-churn session is the instrument most likely to catch the
non-reproducible false-removal banner in the act.
