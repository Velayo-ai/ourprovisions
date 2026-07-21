# SPEC — Reconcile `users.full_name` from Clerk (attribution name fix)

**Scope:** OurProvisions
**Type:** Client sync effect (new). No schema change. No RPC change.
**Risk:** Low. Reuses an already-RLS-proven write path. Own effect, decoupled
from bootstrap. Dev-first.
**Surface:** `src/hooks/useProvisions.js` (new effect + tiny export). Render side
needs **no change** — the email fallback already exists.

---

## The bug (root cause, confirmed by prod queries)

Item badges show wrong / missing / inconsistent adder names ("Test User 30",
sometimes blank, sometimes a stale name). Traced through five wrong hypotheses to
the actual cause:

**Every real user in prod has `users.full_name = NULL.`** Verified: 5/5 users
(danholm@cisco, both Hennessys, amh2530, daniel.l.holmes+test20) — all NULL,
including one created 2026-06-29. This is systemic and current, not legacy.

Why it stays NULL:
- `full_name` is only ever written inside `bootstrap_new_user`, which **runs once
  per user and is a no-op on subsequent sessions.**
- At that single bootstrap moment, Clerk's name often isn't populated yet
  (`firstName`/`lastName` arrive slightly after the initial session for email/OAuth).
  So the client passes `p_full_name = null` (App→hook `fullName` prop empty), and
  the RPC's `coalesce(excluded.full_name, users.full_name)` preserves NULL.
- The bootstrap effect **deliberately excludes `fullName` from its deps**
  (useProvisions.js ~line 309 comment) because feeding it in wedged the loading
  state. So bootstrap structurally **cannot** re-run when the name later arrives.
- Net: the name is written at most once, at the worst possible time, and there is
  no path that reconciles it afterward. `updateFullName` only fires on a *manual*
  profile-sheet edit — which none of the five ever did.

Also noted (separate issue, not fixed here): `bootstrap_new_user` has **4 overloads**
in prod. Overload ambiguity is a latent hazard and echoes migration 015's duplicate-
function cleanup. See "Follow-ups."

**Why not just fix the RPC again:** someone already patched the newest overload to
save `full_name` — it's correct but starved, because the client sends NULL at the
only moment it calls, and the overload actually executing is uncertain. Fixing the
insert can't fix a caller that passes NULL once and never again. The reconciliation
must live outside bootstrap.

---

## The fix

A dedicated **name-reconciliation effect** in `useProvisions.js`, independent of
bootstrap. Whenever Clerk's `fullName` is present and differs from what's stored,
write it straight to `users.full_name` keyed on the internal user id. Idempotent,
self-healing, no household logic, no RPC, no overload exposure.

It **reuses the exact update `updateFullName` already runs** (useProvisions.js
~line 1317-1320) — that update is proven to satisfy RLS (a user may update their
own `users` row), so no new policy is needed:

```js
await db.from("users").update({ full_name: trimmed }).eq("id", internalUserIdRef.current);
```

### Implementation

Add after bootstrap is complete (needs `internalUserIdRef.current` set). New effect:

```js
// Reconcile users.full_name from Clerk on each session.
// WHY its own effect: bootstrap runs once and is a no-op for existing users, and
// deliberately excludes fullName from its deps (feeding it there wedged loading).
// So the name that arrives from Clerk *after* first bootstrap never persists.
// This effect closes that gap: idempotent, own dep on fullName, only writes on a
// real change. Does NOT go through bootstrap_new_user (avoids its 4-overload
// ambiguity entirely).
const lastSyncedNameRef = useRef(null);
useEffect(() => {
  const db = supabaseRef.current;
  const name = (fullName || "").trim();
  if (!db) return;
  if (!bootstrappedRef.current || !internalUserIdRef.current) return; // need our user id
  if (!name) return;                        // Clerk has no name yet — nothing to write
  if (lastSyncedNameRef.current === name) return; // already reconciled this value

  (async () => {
    try {
      // Only write if stored value actually differs (avoid needless writes/realtime churn)
      const { data: existing } = await db
        .from("users")
        .select("full_name")
        .eq("id", internalUserIdRef.current)
        .maybeSingle();
      if (existing && existing.full_name === name) {
        lastSyncedNameRef.current = name;
        return;
      }
      const { error } = await db
        .from("users")
        .update({ full_name: name })
        .eq("id", internalUserIdRef.current);
      if (error) throw error;
      lastSyncedNameRef.current = name;
    } catch (err) {
      console.error("full_name reconcile error:", err.message);
      // Non-fatal: attribution degrades to email prefix, never blocks the app.
    }
  })();
}, [fullName, bootstrapped]); // fires when Clerk name arrives or changes, post-bootstrap
```

Notes for the implementer:
- `bootstrapped` (state) is already in scope and flips true after setup — using it
  as a dep makes the effect re-evaluate once bootstrap finishes. `bootstrappedRef`
  guards the body.
- `lastSyncedNameRef` prevents a write loop and repeated no-op writes.
- This is **not** coupled to the bootstrap effect, so it cannot reintroduce the
  loading-wedge the line-309 comment warns about.

### Render side — NO CHANGE NEEDED

App.js (~line 831-833) already falls back correctly:
`full_name || email.split("@")[0] || null`. Once reconciliation populates
`full_name`, badges show the real name; until then they show the email prefix
(e.g. `tyler.hennessy96`) — which is the agreed honest fallback. Confirm this line
still reads that way after any drift; do not "fix" it.

---

## Existing NULLs — self-heal, no backfill

The 5 existing NULL users heal automatically the next time each opens the app with
a Clerk name present (the effect writes it). No manual SQL backfill required. If a
user has no name in Clerk at all, they stay on the email-prefix fallback, which is
correct. **Do not** hand-write names into `users` — let the effect own it.

---

## Verify (deployed dev preview, not localhost)

1. **Fresh user:** sign in a brand-new Clerk account (incognito, plus-alias). After
   load, query dev `users` → `full_name` is populated without any manual profile edit.
2. **Existing NULL heals:** on dev, manually null a test user's `full_name`, reload
   the app as that user → `full_name` repopulates from Clerk on its own.
3. **Badge shows real name:** that user adds an item in another household member's
   view → badge shows their actual name, not an email prefix and not a stale name.
4. **No name in Clerk:** a user with blank Clerk name → badge shows email prefix,
   app does not error, no write loop (check network tab: at most one `users` update).
5. **No loading wedge:** editing your own name in the profile sheet still works and
   does not hang the app (the line-309 regression must not return).

---

## Follow-ups (separate specs, not this one)

- **`bootstrap_new_user` overload cleanup.** 4 bodies exist in prod; only the newest
  is name-aware. Drop the stale overloads so the called signature is unambiguous.
  Same class as migration 015. Query current overloads via `pg_proc` by `proname`
  + `pg_get_function_identity_arguments` before dropping. Prod DB change → own spec.
- **`householdMembers.users.full_name` vs `users.full_name` divergence.** The embedded
  member data can show a name the base table lacks; once reconciliation runs both
  converge, but worth confirming the member load reads the same source of truth.
