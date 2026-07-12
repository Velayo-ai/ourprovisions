# SPEC — Fix duplicate household creation (double-tap create-in-flight guard)

**Status:** Ready to build. Client fix + one-time prod cleanup.
**Root cause:** CONFIRMED via prod queries 2026-07-10. Reproduced by Candidate A
(double-tap on Create). Two `create_household` invocations 259ms apart
(`04:07:11.952856` and `04:07:12.211989`) produced two distinct household ids,
each with its own owner membership. The Create button (`App.js:1338`) has an
`async onClick` that awaits `createHousehold(n)` for ~2s on 3G but is never
disabled during the await — a second tap in that window fires a second RPC before
the first resolves, and neither call can see the other's row.

**Truth table row landed:** *True duplicate creation — RPC ran twice — creation-race.*

---

## Decision: client button-disable now; server idempotency = WATCH ITEM (not this commit)

Two defenses exist against a double-fire; they stop different triggers.

- **Client button-disable** stops the double-*tap* — the exact trigger reproduced.
  Cheap, low-risk, kills the observed bug. **This is the fix.**
- **Server idempotency** would stop a double-fire from *any* source, including a
  retry hook (which a disabled button can't stop, since it originates in code, not
  a finger). NOT built now because: (1) the reproduced trigger is a human 259ms
  double-tap, not a retry; (2) `households.name` is intentionally non-unique (two
  real households may share a name), so any server dedup is a fuzzy
  `(created_by, name)`-within-a-window heuristic that risks blocking a legitimate
  fast second create. Adding that risk for a trigger we have not observed violates
  "wait until users complain." **Watch signature:** a retry-driven duplicate would
  show a `created_at` delta that is either sub-10ms (near-simultaneous) or spaced
  at the retry interval — distinct from a ~250ms human tap. If that signature ever
  appears in prod, promote server idempotency.

---

## Part 1 — Client fix (App.js)

### 1a. Add in-flight state
`creating` (App.js:362) is a MODE flag (form open/closed) — do NOT overload it.
Add a dedicated in-flight boolean beside it:

```js
const [creating, setCreating] = useState(false);
const [newHouseholdName, setNewHouseholdName] = useState("");
const [creatingInFlight, setCreatingInFlight] = useState(false);  // NEW
```

### 1b. Guard the handler + disable the button
Grep-before-edit anchor: the Create button `onClick` at ~App.js:1338–1356
(inside `{/* Section 2: Create new household */}`). Current handler awaits
`createHousehold(n)` with no guard. Replace the handler + button with:

```jsx
<button
  disabled={creatingInFlight}
  onClick={async () => {
    if (creatingInFlight) return;              // guard: ignore taps while in flight
    const n = newHouseholdName.trim();
    if (!n) return;
    setCreatingInFlight(true);                 // raise BEFORE the await
    try {
      const newId = await createHousehold(n);
      if (newId) {
        await refreshHouseholds();
        switchHousehold(newId);
        setShowHouseholdModal(false);
        setCreating(false); setNewHouseholdName("");
        showToast(`"${n}" created`);
      }
    } finally {
      setCreatingInFlight(false);              // clear even on error/early return
    }
  }}
  style={{
    flex: 2, padding: "10px",
    background: creatingInFlight ? "#C9A87E" : "#A0724A",   // dimmed while in flight
    border: "none", borderRadius: "8px", fontFamily: "'Lato', sans-serif",
    fontSize: "0.8rem", fontWeight: 700,
    cursor: creatingInFlight ? "default" : "pointer", color: "#FAF4EC",
  }}
>{creatingInFlight ? "Creating…" : "Create"}</button>
```

**Why both `disabled` AND the `if (creatingInFlight) return;` guard:** `disabled`
is the visible affordance; the early-return closes the tiny window between the
first tap's state update committing and React re-rendering the disabled attribute.
Belt for the eye, suspenders for the race.

**Why raise the flag BEFORE the await and clear in `finally`:** mirrors the
`deliberateLossRef` pattern — the guard must cover the entire gap between invoke
and resolve, and must clear on every exit path (success, `newId` falsy, thrown
error) so a failed create doesn't leave the button dead.

### Done when (client)
- On Slow 3G, open Create, type a name, tap Create, then tap again fast: only ONE
  household appears; button shows "Creating…" and is unclickable during the await.
- A create that errors re-enables the button (no permanent lock).
- Verify on the deployed dev preview, not localhost. Then dev→main.

---

## Part 2 — One-time prod cleanup (soft-delete duplicate ids)

Candidate A left duplicate "Test House 200" pairs on prod. Soft-delete the LATER
id of each dup pair, preserving the earliest (`created_at asc` → keep first).

**Truth first: confirm project id `parpauldmbetptkmdwbd` in the URL before running.**

### 2a. Preview what will be soft-deleted (READ-ONLY — run + eyeball first)
```sql
with ranked as (
  select id, name, created_by, created_at,
         row_number() over (
           partition by created_by, name
           order by created_at asc
         ) as rn
  from households
  where deleted_at is null
)
select id, name, created_at, rn,
       case when rn > 1 then 'WILL SOFT-DELETE' else 'keep' end as action
from ranked
where name in (select name from ranked where rn > 1)
order by name, created_at asc;
```
- Eyeball: every `rn = 1` is a keeper; every `rn > 1` is a same-name,
  same-creator duplicate created later. Confirm the ids match the known
  Test House 200 dupes (`a4631737…` keep, `a2a1948d…` delete) before mutating.
- **Scope guard:** the outer `where name in (...)` restricts to names that actually
  have a duplicate — a legitimate solo household never appears here. If any row you
  did NOT expect shows up (a real second household you meant to keep), STOP — do not
  run 2b, resolve by id manually.

### 2b. Soft-delete the duplicates (MUTATING — run only after 2a looks right)
```sql
with ranked as (
  select id,
         row_number() over (
           partition by created_by, name
           order by created_at asc
         ) as rn
  from households
  where deleted_at is null
)
update households
set deleted_at = now()
where id in (select id from ranked where rn > 1);
```
- Soft-delete (sets `deleted_at`), never a hard `DELETE` — reversible, and
  `get_my_households` already filters `h.deleted_at is null`, so the dup drops out
  of the switcher immediately on next fetch.
- Their `household_members` owner rows can be left as-is; the household filter in
  `get_my_households` hides the pair regardless. (Optional tidy: soft-delete the
  matching membership rows too, but not required for correctness.)

### 2c. Verify
```sql
select id, name, created_at, deleted_at
from households
where name = 'Test House 200'
order by created_at asc;
```
- Expect: the earliest id has `deleted_at = null`; the later id(s) carry a
  timestamp. Reload the app — switcher shows Test House 200 once.

### Done when (cleanup)
- 2a preview shows only known duplicates flagged.
- 2b run; 2c confirms one live id per name.
- App switcher shows no duplicate households after reload.

---

## WATCH ITEM (do not build now — log to ROADMAP NEXT)

**Server-side idempotent create.** If prod ever shows a duplicate with a
non-human `created_at` signature (sub-10ms, or spaced at the retry interval),
the button-disable is being defeated by a code-path re-fire (retry hook), and
`create_household` needs a server guard. Candidate approach: dedup on
`(created_by, name)` within a short window inside the RPC — but must NOT become a
hard unique constraint (names are intentionally non-unique). Revisit before any
feature makes programmatic (non-tap) create calls.
