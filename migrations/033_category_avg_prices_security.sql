-- 033_category_avg_prices_security.sql
-- Close the SECURITY DEFINER VIEW gap on public.category_avg_prices, and end the
-- dev/prod definition drift, in one transaction.
--
-- NUMBERING: 032 (RLS on the cycle tables) is the highest on disk and is NOT YET
-- APPLIED anywhere. 031 remains reserved for cycle-integrity (SPEC_cycle_integrity_031).
-- 033 is independent of both — it touches one view and no table, so it can be applied
-- before or after 032 without interaction.
--
-- =====================================================================
-- SEQUENCING CONSTRAINT — DO NOT SPLIT THIS FILE
-- =====================================================================
-- The redefinition and the security_invoker flip close DIFFERENT HALVES of the same
-- problem and must ship together:
--   * security_invoker alone -> the view starts honouring the caller's RLS, so each
--     household would see a DIFFERENT average once custom items get priced (their own
--     custom rows blending in via catalog_items_select's per-household visibility).
--     A single consistent fallback estimate becomes a household-varying one.
--   * the is_global filter alone -> output is correctly scoped, but the view still
--     runs as its owner and still bypasses RLS on catalog_items entirely.
-- Ship both. RLS is the backstop; the query should ask for what it wants. Same
-- principle as the 022 fix.
-- =====================================================================
--
-- =====================================================================
-- THIS FILE ENDS A DEV/PROD DRIFT — READ BEFORE APPLYING
-- =====================================================================
-- The two environments had DIFFERENT VIEWS UNDER THE SAME NAME (confirmed by
-- pg_get_viewdef on both, 2026-08-17):
--
--   prod: select category, round(avg(price_hint), 2)
--         from catalog_items
--         where price_hint is not null and deleted_at is null
--         group by category;                                  -- 5 rows
--
--   dev:  select ci.category, avg(li.price_per_unit)
--         from list_items li join catalog_items ci on ci.id = li.catalog_item_id
--         where li.price_per_unit is not null
--         group by ci.category;                               -- 0 rows, no deleted_at filter
--
-- 000_canonical_baseline.sql:348 defines the DEV version, so PROD is the drift — it was
-- redefined out-of-band and never recorded in any migration on disk. Same class of hole
-- as the migration-024 record gap closed by ef1807b.
--
-- BUT PROD'S DRIFT IS THE SAFER SHAPE, AND IS WHAT THIS MIGRATION ADOPTS.
-- The baseline (list_items) definition aggregates per-household transaction prices.
-- Prod today holds 63 priced list_items rows, 52 of them on custom items, belonging to
-- EXACTLY ONE household. Under the baseline definition prod's "cross-household average"
-- would be one household's actual shopping prices, served to anon with RLS bypassed —
-- no aggregation cover at all. Reverting prod to canonical would have been actively
-- harmful. Dev is empty (0 priced list_items) only by accident of it being dev.
--
-- So: the catalog_items/price_hint shape becomes canonical in BOTH environments and in
-- the baseline. 000_canonical_baseline.sql is updated in the same commit — a rebuild
-- from the uncorrected baseline would otherwise reintroduce the vulnerable definition.
-- =====================================================================
--
-- WHY THIS IS A REAL BYPASS
-- A view with no security_invoker option runs with the VIEW OWNER's privileges, not the
-- caller's. Owner is `postgres`, which also owns catalog_items, and
-- catalog_items.relforcerowsecurity is false — RLS never applies to a table's owner
-- unless FORCE is set. So the view's scan bypassed catalog_items' RLS completely,
-- including the migration-022 anon policy that restricts anon to is_global rows.
-- Confirmed on BOTH environments: reloptions IS NULL, owner IS postgres,
-- relforcerowsecurity IS false.
--
-- WHAT WAS ACTUALLY EXPOSED (honest scope)
-- Nothing beyond what anon may already read. On prod all 27 contributing rows are
-- is_global = true, so today's output derives entirely from global seed data that the
-- 022 policy already serves to anon directly. This is an UNEXPLOITED LATENT gap, NOT a
-- repeat of the 022 disclosure (which was 133 custom rows of user-authored free text,
-- confirmed served to anon). Keep that distinction — it is the difference between a
-- capability gap and a disclosure.
-- The gap is on a timer: the moment any household sets a price_hint on a custom item,
-- that value silently joins a publicly-readable aggregate through a path that ignores
-- is_global. Closing it now is cheap precisely because it is still empty.
--
-- SMALL-N NOTE (not fixed here, deliberately)
-- Aggregation is not anonymization at n=1. Prod category row-counts are
-- Beverages 1, Meat & Seafood 3, Dairy 5, Pantry 6, Produce 12 — the Beverages average
-- IS that single row's exact price_hint. Harmless today (all rows global seed data), and
-- with is_global enforced it can only ever expose seed prices. Worth remembering if the
-- filter is ever loosened.
--
-- THE VIEW STAYS ANON-READABLE. That is intended, not an oversight — useProvisions.js:266
-- fetches it with the raw anon key on the pre-auth splash path, before any Clerk token
-- exists. Grants are untouched. The fix scopes WHAT anon reads, it does not remove the
-- read. A 42501 after this migration means something broke, not that it worked.
--
-- CLIENT CALL SITES (both read the same two columns; neither changes)
--   useProvisions.js:266  raw anon-key fetch   (pre-auth splash path)
--   useProvisions.js:599  authenticated client (.from("category_avg_prices"))
-- With security_invoker on and the is_global filter, BOTH callers now get the identical
-- global-only aggregate. Without the filter, :599 would have diverged per household.

begin;

-- Column signature is preserved EXACTLY — (category text, avg_price numeric) in both
-- environments, verified via pg_attribute before authoring. CREATE OR REPLACE VIEW
-- requires identical column names, types and order; a mismatch would error rather than
-- silently succeed. price_hint is numeric in both, so round(..., 2) is legal in both.
create or replace view public.category_avg_prices as
  select
    category,
    round(avg(price_hint), 2) as avg_price
  from catalog_items
  where price_hint is not null
    and deleted_at is null
    and is_global = true          -- explicit scope; do not rely on RLS alone (cf. 022)
  group by category;

alter view public.category_avg_prices set (security_invoker = on);

commit;

-- =====================================================================
-- VERIFY
-- =====================================================================
-- (1) security_invoker actually took — the whole point of the migration:
--
-- select relname, reloptions from pg_class where relname = 'category_avg_prices';
--
-- Expect: {security_invoker=true}. Before this migration it was NULL in both
-- environments. NULL or an absent option means the flip did not apply — do not
-- proceed to prod.
--
-- (2) Body is now identical in both environments:
--
-- select pg_get_viewdef('public.category_avg_prices'::regclass, true);
--
-- Expect byte-identical output on dev and prod. That equality IS the drift fix; check
-- it explicitly rather than assuming the same file produced the same result.
--
-- (3) DEV — confirm the new shape does not error under dev's empty state:
--
-- select count(*) from public.category_avg_prices;
--
-- Expect 0. Dev has zero catalog_items rows with a price_hint, so 0 rows is correct and
-- unchanged from before. NOTE: this check is trivially satisfied — 0 before and 0 after
-- proves only that the view parses and scans without error under dev's data. It does
-- NOT exercise the is_global filter or the invoker path. Dev cannot validate this fix's
-- behaviour; prod is the only environment with data. Do not read dev-green here as
-- meaningful coverage.
--
-- (4) PROD — anon-key PostgREST, before and after. This is the check that matters, and
-- it must be run from OUTSIDE the database. The SQL editor runs as postgres, owns the
-- view and the base table, and bypasses RLS — it returns all rows whether the fix
-- worked or not. Same trap as 022 and SPEC_anon_catalog_exposure.
--
--   $anon = "<prod anon key>"; $h = @{ apikey = $anon; Authorization = "Bearer $anon" }
--   $r = Invoke-RestMethod -Uri "https://parpauldmbetptkmdwbd.supabase.co/rest/v1/category_avg_prices?select=category,avg_price" -Headers $h
--   "$($r.Count) rows: $(($r | Sort-Object category | ForEach-Object { $_.category }) -join ', ')"
--
-- Expect IDENTICAL results before and after: HTTP 200, 5 rows,
--   Beverages, Dairy, Meat & Seafood, Pantry, Produce
-- with avg_price 11.00, 4.90, 7.99, 4.42, 2.71 respectively (recorded 2026-08-17).
--
-- UNCHANGED IS THE PASS CONDITION. Every contributing row on prod is already
-- is_global = true (27 of 27), so the filter removes nothing today and the invoker flip
-- removes nothing for anon. A DROP in row count means something legitimate broke — most
-- likely the anon SELECT grant or the 022 policy — NOT that the fix took hold. Diagnose,
-- do not celebrate.
--
-- (5) Anon still gets a clean read, not a permission error:
-- HTTP 200 expected. A 401/42501 means the grant was disturbed; this view is meant to
-- stay anon-readable (useProvisions.js:266 depends on it pre-auth).
--
-- (6) Advisor: re-run get_advisors -> the security_definer_view ERROR for
-- public.category_avg_prices should be gone.
