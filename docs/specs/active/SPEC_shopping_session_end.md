# SPEC — Shopping session end: separate "shopping ended" from "trip wrapped"

**Scope:** OurProvisions · **Status:** Parked — not scheduled (design settled 2026-10-28)
**Touches:** `shopping_sessions`, `list_items`, shop-tab wrap-up UI, one new RPC, one trigger, prod data backfill

---

## 1. Why

Field report (2026-10-28, Market Basket): Dan checked off 9 items, ignored the
last-item wrap-up prompt, left the store, and reopened the app hours later to find
the trip still "shopping": **344 minutes for 9 items.**

Root cause: the trip's end time is the moment the user taps Wrap Up. The app has
no record of when shopping actually stopped. Any forgotten tap corrupts duration,
and duration feeds Phase 2 ordering and Phase 4 savings.

Second finding: "Wrap up" was presented as if the user were still in the store.
Wrap Up is really the *after*-trip moment, where the receipt belongs (Phase 3).

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Shopping ended** and **trip wrapped** are two separate timestamps. | Analytics need the first right away. The user owns the second, and it's the receipt hook. |
| D2 | Shopping ends after **30 min with no check activity**. `shopping_ended_at = last_activity_at` exactly, with no checkout buffer. | The last activity is when shopping ended. Checkout time is unknown, so we don't invent it. |
| D3 | Idle alone is enough to end shopping. "Left the store" (from location) only **labels** the end (`end_reason`) and is never required. | On web, location exists only while the app is open, and some users deny it. Requiring it would leave those trips "shopping" forever. |
| D4 | The auto-end is **reversible**: checking another item reopens the trip. | Undo rule. A wrong auto-end costs nothing, so no location gate is needed for correctness. |
| D5 | The auto-end never wraps the trip. The user sees a **recap card** with the Wrap Up action. | Gives the receipt a natural home and keeps the human's last word. |
| D6 | A trip that is never wrapped closes when the user's **next trip starts** (`wrap_reason = 'superseded'`). | Recap and receipt nudges must never stack up. |
| D7 | Trip status is **derived from the timestamps**, with no `status` column. | A stored status can disagree with the timestamps. Derived status can't. |
| D8 | Ship the data and copy changes **now**. "Add receipt" joins the recap card in Phase 3. No "coming soon" button. | Every trip recorded until then is otherwise polluted. A dead button teaches people to ignore that part of the screen. |
| D9 | `list_items` gains `checked_at`. | Today the only timestamp is `updated_at`, which any edit (such as a quantity change) moves. Check time is currently guessed, not known. |

### Derived status (D7)

| shopping_ended_at | ended_at | Status | Shop tab shows |
|---|---|---|---|
| null | null | **active** | Normal shop mode + quiet "Done? Wrap up" bar after the last item |
| set | null | **shopping_ended** | Recap card: *"Market Basket trip · 9 items · 22 min — Wrap up"* |
| set | set | **wrapped** | Nothing (trip closed) |
| null | set | *invalid* | Prevented by a CHECK constraint |

## 3. Schema changes (migration — assign the number at build)

```sql
-- list_items: a real check timestamp
alter table public.list_items add column checked_at timestamptz;

-- shopping_sessions: activity + end semantics
alter table public.shopping_sessions
  add column last_activity_at  timestamptz,
  add column shopping_ended_at timestamptz,
  add column end_reason  text,   -- how shopping_ended_at was set
  add column wrap_reason text,   -- how ended_at was set
  add constraint ss_end_reason_chk  check (end_reason  in ('user_wrapped','idle_left_store','idle','backfill')),
  add constraint ss_wrap_reason_chk check (wrap_reason in ('user','superseded')),
  add constraint ss_wrapped_implies_ended_chk check (ended_at is null or shopping_ended_at is not null);
```

`ended_at` keeps its current meaning: the moment the trip was wrapped. Existing
readers of `ended_at` don't break. They just stop being the right source for duration.

**Trip duration** (canonical) = `shopping_ended_at − started_at`.
`aisle_order_sessions` keeps its own `first_check`/`last_check` window (see Pre-build check 1).

## 4. Server logic

### 4a. Trigger on `list_items` (check activity)
- **BEFORE UPDATE OF status:** when status changes *to* checked, set `checked_at = now()`.
  When it changes *away from* checked, set `checked_at = null`.
- **AFTER UPDATE OF status**, when `session_id` is not null and status changed:
  - set `shopping_sessions.last_activity_at = now()`
  - if that session has `shopping_ended_at` set and `ended_at` null, **reopen it** (D4):
    set `shopping_ended_at = null` and `end_reason = null`.
- Use SECURITY DEFINER with `search_path` pinned. It derives nothing from caller input.
  It's needed because another household member's check (`checked_by`) must be able to
  touch a session row they don't own.

### 4b. RPC `mark_shopping_ended(p_session_id uuid, p_left_store boolean)`
- SECURITY DEFINER, `search_path` pinned. Identity comes from `auth.jwt()->>'sub'`,
  and the caller must be a member of the session's household.
- **The server enforces the rule** (the client cannot backdate arbitrarily):
  only acts if `ended_at is null`, `shopping_ended_at is null`, and
  `now() − last_activity_at >= 30 min`.
- Sets `shopping_ended_at = last_activity_at` and
  `end_reason = case when p_left_store then 'idle_left_store' else 'idle' end`.
- Returns the session row (or nothing if the rule wasn't met), so the client can render the recap.

### 4c. Wrap Up (modify the existing wrap path)
```
ended_at          = now()
wrap_reason       = 'user'
shopping_ended_at = coalesce(shopping_ended_at,
                      case when now() - last_activity_at >= 30 min then last_activity_at else now() end)
end_reason        = coalesce(end_reason, 'user_wrapped')
```
A user tapping Wrap Up in line ends shopping *now* (includes checkout, honestly
user-confirmed). A user tapping it 3 hours later gets the backdated time.

### 4d. Session start (modify the existing start path)
Before creating a new session for a user, settle that user's open sessions:
1. Any still **active** and idle ≥ 30 min → apply 4b's end logic (`end_reason = 'idle'`).
2. Any in **shopping_ended** → `ended_at = now()`, `wrap_reason = 'superseded'`.

## 5. Client logic

### 5a. On app open / shop tab focus
If the user has an **active** session with `now() − last_activity_at ≥ 30 min`:
1. If location permission is *already granted* (don't prompt for it here), compare the current
   position to the session's `gps_lat/lng`, falling back to the last checked item's
   `checked_lat/lng`. Treat more than ~300 m as `left_store = true`. Otherwise `false`.
2. Call `mark_shopping_ended(session_id, left_store)`.
3. Render the recap card.

### 5b. Recap card (**mockup pass required before build** — new prompt rule)
- Content: store name · item count · duration (from `shopping_ended_at − started_at`) · **Wrap up**
- Phase 3 slot: **Add receipt**, a second action on the same card. Not rendered until it works.
- Replaces the "still shopping" state. It must not read as "you're in the store."
- The last-item wrap-up modal becomes a persistent, quiet "Done? Wrap up" bar
  (it currently vanishes if ignored).

## 6. Backfill (prod — runs after the migration, dev first)

Historical check times are unknown (D9), so `updated_at` of checked items is the
best available guess. All backfilled rows are tagged `end_reason = 'backfill'` so analytics
can treat them as lower-confidence.

```
last_activity_at = coalesce(max(list_items.updated_at where session_id = s.id and status is checked),
                            s.started_at)

-- wrapped sessions
shopping_ended_at = case when ended_at - last_activity_at > 30 min then last_activity_at else ended_at end
-- open sessions idle > 30 min (includes Dan's Market Basket trip if still open)
shopping_ended_at = last_activity_at          -- ended_at stays null → shows recap card
end_reason        = 'backfill'
wrap_reason       = 'user' where ended_at is not null
```
Do not backfill `list_items.checked_at`. Leave it null historically rather than invent it.

## 7. Pre-build checks (Claude Code, against the correct environment)

1. **`aisle_order_sessions`:** is it a view or a table? Read its definition (`prosrc`/`pg_views`,
   not the truncated editor output). How are `first_check`/`last_check` derived? Does anything
   compute duration from `started_at`/`ended_at`? If it uses `list_items.updated_at`, repoint it to
   `checked_at` (with an `updated_at` fallback for old rows) in this same change.
2. **Status values:** confirm the exact `list_items.status` value(s) meaning "checked"
   (and whether `deferred` counts as activity — proposed: yes, it's a deliberate in-store action).
3. **Wrap and start code paths:** locate the existing ones that 4c and 4d modify.
4. **`reality_answer` flow:** what triggers `reality_asked_at` today? The recap card must not stack
   with that prompt. Settle the order (likely: the reality question moves into the recap card).
   **Open — bring back to design if it isn't obvious.**

## 8. Verification (dev, deployed preview — never localhost)

| # | Action | Expect |
|---|---|---|
| V1 | Check an item in an active trip | `checked_at` set; `last_activity_at` bumped |
| V2 | Uncheck it | `checked_at` null; `last_activity_at` bumped |
| V3 | Set `last_activity_at = now() − 31 min` via SQL, reopen app | Recap card; `shopping_ended_at = last_activity_at`; `end_reason` set |
| V4 | Same as V3 at 29 min | Nothing happens; RPC returns no row |
| V5 | After V3, check another item | Trip reopens; `shopping_ended_at` null |
| V6 | Tap Wrap Up on the recap card | `ended_at` set, `wrap_reason='user'`; `shopping_ended_at` unchanged |
| V7 | Leave a trip in shopping_ended, start a new trip | Old trip `wrap_reason='superseded'` |
| V8 | Call the RPC as a non-household member | Rejected |
| V9 | Try to set `ended_at` with null `shopping_ended_at` | CHECK constraint rejects |
| V10 | After backfill (prod): Dan's Market Basket trip | Duration ≈ minutes, not 344 |

Verify each by querying the rows. "Success. No rows returned" is not a verification signal.

## 9. Out of scope
- Receipt import (Phase 3). This spec only reserves its slot on the recap card.
- Background geofencing on native and "Always allow location" (Phase 2 store recognition, opt-in).
- A pg_cron sweep for users who never reopen the app. Possible follow-up.
  Until then, analytics should treat an active session idle ≥ 30 min as ended at `last_activity_at`.
