# meal-photo-sweep

Permanently deletes soft-deleted meal photos after a 30-day grace, and orphan objects in
`meal-photos` after 7 days. Spec: `SPEC_photo_sweep.md` (+ Amendment 2026-10-25).

| | |
|---|---|
| **Runs as** | service role (`SUPABASE_SERVICE_ROLE_KEY`, injected by the platform) |
| **Auth** | `x-sweep-secret` header vs `SWEEP_SECRET`. `verify_jwt = false` — the caller is pg_net, not a user. |
| **Reads / deletes rows via** | 070: `meal_photo_sweep_expired`, `meal_photo_sweep_orphans`, `meal_photo_sweep_delete_rows` (service_role only) |
| **Deletes objects via** | Storage API `remove()` only, bucket `meal-photos` hard-coded (D6) |
| **Live only when** | body `{"dry_run": false}` **and** secret `SWEEP_LIVE=true`. Otherwise a dry run. |
| **Output / logs** | counts only — `dry_run, expired_found, expired_removed, rows_deleted, orphans_found, orphans_removed, skipped_bad_path, capped, errors` |

## Order (dev first, always)

1. Apply `migrations/070_meal_photo_sweep_rpcs.sql` in the dev SQL editor; VERIFY; ledger row.
2. Deploy, with `SWEEP_LIVE` **unset**:

```bash
npx supabase login                       # or export SUPABASE_ACCESS_TOKEN
npx supabase link --project-ref zxwtxjjmssykhqrghouf

# A fresh random secret per project, never committed. Keep it for step 3 and for 071's Vault entry.
npx supabase secrets set SWEEP_SECRET="$(openssl rand -hex 32)"

npx supabase functions deploy meal-photo-sweep --no-verify-jwt
```

3. Dry run, then compare against the hand count below:

```bash
curl -s -X POST https://zxwtxjjmssykhqrghouf.supabase.co/functions/v1/meal-photo-sweep \
  -H "x-sweep-secret: $SWEEP_SECRET" -H "content-type: application/json" -d '{"dry_run": true}'
```

4. Live run (Rollout 2) is a separate, explicit step: `npx supabase secrets set SWEEP_LIVE=true`,
   then `-d '{"dry_run": false}'`. Unset it again (`secrets unset SWEEP_LIVE`) if the read-back is wrong.

## Hand count — the dry run must match

```sql
select (select system_identifier from pg_control_system()) as which_db,
  (select count(*) from meal_photos where deleted_at < now() - interval '30 days') as expired,   -- = expired_found (≤ 500)
  (select count(*) from storage.objects o
    where bucket_id = 'meal-photos' and created_at < now() - interval '7 days'
      and not exists (select 1 from meal_photos p where p.thumb_path = o.name or p.view_path = o.name)) as orphans, -- = orphans_found (≤ 1000)
  (select count(*) from meal_photos where deleted_at < now() - interval '30 days'
      and not (thumb_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}-(thumb|view)\.(webp|jpg)$'
           and view_path  ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}-(thumb|view)\.(webp|jpg)$')) as expired_bad_path,
  (select count(*) from meal_photos) as rows_total,
  (select count(*) from storage.objects where bucket_id = 'meal-photos') as objects_total; -- both unchanged after a dry run
```

Run it before and after the dry run: `rows_total` and `objects_total` must not move (Verification 9).
