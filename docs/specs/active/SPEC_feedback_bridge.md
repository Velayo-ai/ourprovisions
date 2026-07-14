# SPEC — "Message the Bridge" Feedback Channel

**Scope:** OurProvisions · Beat 0 · the ACTIVE half of the two-way channel
**Status:** Design locked (2026-07-06). Ready to build.
**Owner:** Claude Code (merge authority)

---

## Why this exists

The 45-day rolling-thunder beta runs on a loop: feedback in → improvement out →
repeat. The channel that captures feedback is therefore the **engine**, not a
polish item — every beat after Beat 0 depends on it. In-app beats "just email
me" because users won't leave the app to compose a message about a $0 grocery
app, but they WILL tap a button and type one line (~5x the signal).

## What it is

A small, persistent affordance ("Message the bridge") that opens a single
textarea and, on submit, both **stores** the message and **notifies** Dan. No
forms, no categories — one field, maritime voice.

## Store + notify (both — decided)

- **Store** = system of record. Writes to a `feedback` table. This is Dan's
  first mission-control surface and the durable, queryable truth. (Store is
  truth — same principle as "truth is a query, never the doc.")
- **Notify** = tap on the shoulder so Dan doesn't have to poll the table.
  Email or webhook on insert.

**Graceful fallback (important):** notify must not become a mini-project. If
reliable email/webhook wiring costs more than ~one evening, ship **store-only**
for Beat 0 and add notify in Beat 1. The table is the part that must not slip.

## Auto-context (decided — attach it)

Every submission auto-captures, so a bare "the button didn't work" is still
debuggable:
- `page` — current screen/route at submit time
- `active_household_id`
- `app_version`
- `clerk_id` — submitter identity
- `message` — the user's words
- `created_at`

Rationale: four cheap nullable columns roughly halve debug round-trips. Same
logic applied to the receipt tables.

## Table: `feedback`

Columns (finalize types at build):
- `id` (pk)
- `clerk_id` (text — Clerk JWT sub, NOT auth.uid())
- `active_household_id` (nullable)
- `page` (text, nullable)
- `app_version` (text, nullable)
- `message` (text)
- `created_at` (timestamptz default now())
- (founder-only, later) `status`, `triage_note`

## RLS / auth

- Insert path from the authenticated app client.
- Identity via `auth.jwt()->>'sub'` (Clerk string ID). **Never `auth.uid()`** —
  returns a UUID and fails silently under Clerk Third-Party Auth.
- Insert-only for users; no select for non-founder (mission-control read is a
  founder-only path, mirrors the beta_signups pattern).

## Verification checklist

- [ ] Affordance visible and unobtrusive on all main screens.
- [ ] Submitting writes a row with all context fields populated correctly.
- [ ] `clerk_id` resolves via JWT sub, not uid.
- [ ] Notify fires (or, if deferred, store-only confirmed and notify ticketed
      for Beat 1).
- [ ] A non-founder cannot select from `feedback`.
- [ ] Empty submit is prevented; submit gives clear confirmation to the user.

## Relationship to telemetry

This is the ACTIVE channel. The PASSIVE channel is Splunk RUM + session replay
(already live). Separate but complementary item: close the telemetry gap so a
prod JS error / failed Supabase write reaches Dan within the hour via an alert,
not just a dashboard. Active + passive = the rolling-thunder engine.
