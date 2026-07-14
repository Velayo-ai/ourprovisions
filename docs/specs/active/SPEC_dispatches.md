# SPEC — "Dispatches" In-App What's-New Surface

**Scope:** OurProvisions · Beat 0 · the founder→users half of the two-way channel
**Status:** Design locked EXCEPT dismissal behavior (see DECISION PENDING).
**Owner:** Claude Code (merge authority)

---

## Why this exists

In-app notices are the in-app echo of each weekly beat. The megaphone is three
channels — **Mailchimp + in-app + social** — and the leverage is **one message,
three destinations:** each beat's dispatch is written ONCE, then dressed as an
email send, an in-app banner, and a social caption. Without this "write once"
discipline a solo founder burns out by Beat 3. Dispatches is the in-app leg.

## What it is

A lightweight in-app surface that shows the current beat's "what's new" notice —
a dismissible banner and/or a small "ship's log / dispatches" panel listing
recent beats.

## Table: `dispatches`

Columns (finalize at build):
- `id` (pk)
- `beat` (text/int — which beat)
- `title` (text) — e.g. "Beat 1: shopping just got smoother"
- `body` (text) — the shared core message
- `published_at` (timestamptz)
- `active` (bool) — is this beat's notice currently live
- `created_at`

Per-user dismissal state (if we go per-user-dismiss): a `dispatch_reads` join or
a localStorage flag — depends on the DECISION below.

## DECISION PENDING — dismissal behavior

Not resolved in the design session. Three candidates:
1. **Dismiss forever, per user** — banner gone once read.
2. **Show until Dan retires that beat** — controlled by `active` flag.
3. **Always show latest; older ones live in a "ship's log" panel.** ← design
   chat's lean: doubles as a public changelog and reinforces the "look how fast
   we're moving" narrative.

**Recommendation to carry in:** option 3. It best serves the rolling-thunder
story (visible momentum) and needs no per-user dismissal tracking for the banner
— the banner always shows the newest active dispatch, and history is browsable.
If Dan prefers per-user dismiss (option 1), add a `dispatch_reads` table keyed on
`clerk_id` + `dispatch_id`, or a localStorage set of seen IDs.

**Do not build the dismissal mechanism until this is chosen.** Build the table +
read path first; wire dismissal once decided.

## RLS / auth

- Users need **read** on active dispatches. Authoring is founder-only.
- If per-user read-state is stored server-side, key on `auth.jwt()->>'sub'`
  (Clerk sub), never `auth.uid()`.

## Presentation

- Banner: unobtrusive, dismissible affordance consistent with the maritime
  system. Must not block the first-run experience.
- Optional "ship's log / dispatches" panel: reverse-chron list of past beats —
  the in-app changelog.

## Verification checklist

- [ ] Newest active dispatch renders for all users.
- [ ] Authoring a new dispatch surfaces it in-app without a deploy (data-driven).
- [ ] Dismissal behaves per the chosen DECISION (once made).
- [ ] Non-founder cannot author/edit dispatches.
- [ ] Copy matches the Mailchimp/social version for that beat (write-once check).
