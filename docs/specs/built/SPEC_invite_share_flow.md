# SPEC — Streamlined invite flow (Web Share + generate-on-open)

**Status:** Ready to build. Client-only (App.js). No DB schema change.
**Scope:** OurProvisions. Reshapes the invite affordance — the Beta 1 activation
pivot. Eye-tested + approved 2026-07-10 (`docs/mockups/mockup_invite_flow.html`).

**Why this matters (not cosmetic):** The Beta 1 success metric has a depth number
— ≥50% of beta users must invite a second person, because the invite is the only
path to the aha moment (live shared-list sync). The current flow dead-ends at
"copied": the user must leave the app, find a messaging app, paste, and send —
and every step is where an invite dies. The depth metric counts *sends*, not
copies. This spec closes the copy→send gap.

**Current flow (6 taps + app-exit):** open manage sheet → find "Invite Someone"
→ tap (closes sheet, opens separate panel) → "Generate invite link" → wait →
"Copy Link" → leave app → paste → send. Sends nothing itself.

**Proposed flow (3 taps, actually sends):** open sheet, tap "Invite someone
aboard" → panel opens with link already prepared + message preview → "Send invite"
→ OS share sheet (message pre-written) → pick a person → sent.

---

## Decisions baked in

| decision | rationale |
|---|---|
| **Send via `navigator.share`** (Web Share API), fallback to Copy | One tap lands the invite in a real conversation with a pre-written message, instead of stranding it on the clipboard. Near-universal on mobile (where the beta lives); absent on some desktop browsers → feature-detect and fall back. |
| **Generate link on panel open**, not behind a "Generate" tap | Opening the panel already declares intent; the "Generate" button was a tap with no user-facing purpose. Link should be ready when they arrive. |
| **Pre-written brand-voice message** carries the collaboration promise | Removes "what do I say?" hesitation AND plants the aha ("we'll share it and it gets smarter") in the invitee's first impression, before they tap the link. Copy must echo the welcome email's "bring your first mate" language so email CTA and in-app action are one vocabulary. |
| **Keep the dedicated panel** (do NOT inline into the manage sheet) | The pivot deserves a focused moment; the manage sheet is already busy (households/create/members/delete). One transition is worth the focus. |
| **Rename button → "Invite someone aboard", make it teal** | Ties CTA to maritime voice + welcome-email language; teal marks it the confident action. Verify it doesn't fight the sand-deep "Create" for hierarchy on the real screen. |

---

## RESOLVED: lazy-generate (Option B) — 2026-07-10

**Chosen:** lazy-generate. Do NOT write a `household_invites` row just because the
panel opened. Generate on the *first* of two intent signals, whichever comes first:
- **idle-after-open** — panel has been open ~500ms (the user is looking at it, not
  bouncing through the manage sheet), OR
- **explicit tap** — the user taps Send or Copy before the idle timer fires.

A fast in-and-out (open panel, immediately close) leaves NO orphan row. Rationale:
keeps `household_invites` honest with no inert self-expiring codes to reason about
later; the extra state is modest. The idle timer means the link is normally ready
by the time the user reaches for Send, so the "preparing" state rarely shows on
good networks — but the tap path guarantees a generate even if they beat the timer.

---

## Build

### Anchors (grep-before-edit — line numbers WILL have drifted)
- Invite trigger button: grep `+ Invite Someone` in `App.js` (~1478). Currently
  `onClick` closes the manage sheet + opens `showInvitePanel`.
- Invite panel: grep `Share Your Household` in `App.js` (~1567–1634). Contains the
  generate/copy two-state block.
- `createInvite`: `useProvisions.js` ~992 — clean async, returns URL or `null`.
  **No change needed** to `createInvite` itself.

### State (add near the invite state, App.js ~355–359)
```js
const [inviteUrl, setInviteUrl] = useState(null);
const [inviteCopied, setInviteCopied] = useState(false);
const [invitePreparing, setInvitePreparing] = useState(false);   // NEW: generate-on-open in flight
const [inviteError, setInviteError] = useState(false);           // NEW: generate failed → show retry
```

### 1. Trigger button (rename + color)
Grep anchor `+ Invite Someone`. Change label → `+ Invite someone aboard`,
background → `var(--teal)` / `#2f7d7a` (was `#A0724A`). Keep the
`setShowHouseholdModal(false); setShowInvitePanel(true);` behavior.

### 2. Lazy-generate (Option B — idle-after-open OR explicit tap)
Do NOT generate on mount. Prepare the link on the first intent signal. Reuse the
create-in-flight posture (raise a flag before the await, clear in `finally`) — same
pattern as the duplicate-household fix, so a slow 3G generate shows a "preparing"
state instead of an empty panel.

**One shared prepare function, called by both the idle timer and the Send/Copy
handlers.** It's idempotent — guarded so concurrent triggers (timer fires the same
tick the user taps) can't double-write:

```js
// Idempotent: prepares the invite link once. Safe to call from the idle timer
// AND from Send/Copy — the guards make a second call a no-op while one is in
// flight or a url already exists. Returns the url (existing or freshly made).
const prepareInvite = useCallback(async () => {
  if (inviteUrl) return inviteUrl;          // already have one
  if (invitePreparing) return null;         // in flight — caller should await state
  setInvitePreparing(true);
  setInviteError(false);
  try {
    const url = await createInvite();
    if (url) { setInviteUrl(url); return url; }
    setInviteError(true); return null;
  } finally {
    setInvitePreparing(false);
  }
}, [inviteUrl, invitePreparing, createInvite]);

// Idle-after-open: if the panel stays open ~500ms, the user is looking at it
// (not bouncing through the manage sheet) → prepare. A fast open/close leaves
// no row because the timer is cleared on unmount before it fires.
useEffect(() => {
  if (!showInvitePanel) return;
  if (inviteUrl || invitePreparing) return;
  const t = setTimeout(() => { prepareInvite(); }, 500);
  return () => clearTimeout(t);
}, [showInvitePanel, inviteUrl, invitePreparing, prepareInvite]);
```

**Send/Copy must await a link before acting** (the user may beat the 500ms timer).
Both handlers call `prepareInvite()` first and use its return, rather than assuming
`inviteUrl` is already set:

```js
// Send handler:
onClick={async () => {
  const url = inviteUrl || await prepareInvite();
  if (!url) return;                       // generate failed → error state already set
  try {
    await navigator.share({
      title: "Come aboard my OurProvisions list",
      text: INVITE_MESSAGE(household?.name, url),
    });
  } catch (e) {
    if (e && e.name !== "AbortError") console.error("share failed:", e);
  }
}}
```
```js
// Copy handler:
onClick={async () => {
  const url = inviteUrl || await prepareInvite();
  if (!url) return;
  navigator.clipboard.writeText(url);
  setInviteCopied(true);
  setTimeout(() => setInviteCopied(false), 2500);
}}
```

**Edge note — clipboard-after-await on Safari:** iOS Safari restricts
`navigator.clipboard.writeText` to a direct user-gesture context; calling it after
an `await prepareInvite()` may fall outside that context on a cold generate. Mitigation:
the 500ms idle timer means `inviteUrl` is almost always already set by tap time, so
the `await` branch rarely runs for Copy. If a cold-tap Safari copy ever fails silently
in testing, fall back to selecting the readonly link field for manual copy. Not
expected to bite given the idle pre-generate; noted so it isn't a surprise.

**On panel close** (the × and any dismiss), reset so the next open regenerates a
fresh link (invite links are per-open; also aligns with the existing
switch-resets-inviteUrl guard at ~606):
```js
// in the close handler:
setShowInvitePanel(false); setInviteUrl(null); setInviteCopied(false);
setInvitePreparing(false); setInviteError(false);
```

### 3. Panel body — three render states
Replace the current `{!inviteUrl ? <Generate> : <copy row>}` block with:

**a. Preparing** (`invitePreparing`): show the panel title + note + a disabled,
dimmed "Preparing your link…" affordance. No dead buttons.

**b. Error** (`inviteError`): in-voice failure, not an apology. Copy:
"Couldn't prepare an invite link. Tap to try again." → a retry button that
re-runs the generate (set `inviteUrl(null)` + re-trigger, or call `createInvite`
directly and set state). Errors explain + offer the fix (per design writing rules).

**c. Ready-or-preparing-with-actions:** with lazy-generate, the action buttons
show as soon as the panel is in its normal state (NOT gated on `inviteUrl` — the
handlers prepare the link on tap if the idle timer hasn't yet). The message preview
DOES gate on `inviteUrl` (nothing to preview until the link exists); until then show
a light "Your invite link is preparing…" placeholder if `invitePreparing`, or the
plain note otherwise.

```jsx
{/* message preview — only once a link exists */}
{inviteUrl ? (
  <div className="invite-msg-preview">
    <span className="lbl">They'll receive</span>
    {INVITE_MESSAGE(household?.name, inviteUrl)}
  </div>
) : invitePreparing ? (
  <div className="invite-msg-preview" style={{ opacity: 0.6 }}>
    <span className="lbl">They'll receive</span>
    Preparing your invite link…
  </div>
) : null}

{/* Primary: Web Share when available. Handler = the Send handler from section 2
    (calls prepareInvite() first, so it works even before the idle timer fires). */}
{typeof navigator !== "undefined" && navigator.share ? (
  <button disabled={invitePreparing} onClick={/* Send handler, section 2 */}
    style={{ /* teal primary btn; dim while invitePreparing */ }}>
    {invitePreparing ? "Preparing…" : "Send invite"}
  </button>
) : null}

{/* Fallback (always shown; sole action on desktop/no-share): Copy.
    Handler = the Copy handler from section 2. */}
<button disabled={invitePreparing} onClick={/* Copy handler, section 2 */}
  style={{ /* navigator.share ? quiet secondary "Copy link instead" : primary "Copy link" */ }}>
  {inviteCopied ? "✓ Copied!" : (invitePreparing ? "Preparing…" : (navigator.share ? "Copy link instead" : "Copy link"))}
</button>
```

Note: because the buttons prepare-on-tap, the separate "preparing" and "error"
full-panel states from (a)/(b) are now mostly covered inline — but KEEP the error
case: if `inviteError` is set (generate failed), swap the message-preview slot for
the in-voice retry line and let the buttons re-trigger `prepareInvite` on next tap.

### 4. The message copy (single source — define once, reuse)
```js
// Brand-voice invite message. Echoes the welcome email's "bring your first mate"
// language so the CTA vocabulary is consistent email → in-app → recipient.
const INVITE_MESSAGE = (householdName, url) =>
  `Come aboard my OurProvisions list${householdName ? ` (${householdName})` : ""} — `
  + `we'll share it and it gets smarter as we go. ${url}`;
```
Keep this near the panel or hoist to a small module const — but ONE definition,
used by both the preview and `navigator.share`, so preview === what's actually sent.

### 5. Panel note copy (the aha, stated plainly)
Replace the current "Send this link to anyone…" note with a line that names the
payoff:
> "They'll join {household} and your list syncs live — you'll see each other's
> edits in real time."

---

## Done when

- Panel opens and STAYS open ~500ms → link prepares automatically (preparing state
  on 3G, then ready); no "Generate" tap remains.
- Panel opened and closed FAST (before 500ms) → NO `household_invites` row written
  (verify in the table: a quick open/close leaves no new code).
- Tapping Send/Copy before the idle timer fires still works — the handler prepares
  the link on the tap.
- On a mobile browser with Web Share: "Send invite" opens the OS share sheet with
  the pre-written message; dismissing it is silent (no error toast).
- On desktop / no Web Share: "Copy link" is the primary action and works.
- Generate failure shows an in-voice retry, not a dead panel.
- Message preview text === the text actually shared (single `INVITE_MESSAGE`).
- Trigger button reads "Invite someone aboard", teal, and doesn't fight "Create"
  for hierarchy (eye-check on the real screen).
- Verified on the deployed dev preview (real phone if possible — Web Share needs a
  real mobile browser + HTTPS; it won't fire on desktop localhost). Then dev→main.

---

## Notes / non-goals

- **`createInvite` unchanged** — still one code per call, 7-day expiry.
- **No DB change.** `household_invites` already exists.
- **Lazy-generate (Option B)** keeps `household_invites` clean — a fast open/close
  writes no row. The 500ms idle timer + prepare-on-tap means the link is normally
  ready by Send-tap time, so "preparing" rarely shows on good networks.
- **Feature-detect, don't UA-sniff** — branch on `navigator.share` existence, not
  browser name.
- **Funnel continuity:** the welcome email's "bring your first mate" CTA must land
  the user where this button is obvious. That's a copy/asset task for the Beta 1
  asset session, but the button rename here is the in-app half of that match.
