# Migrations

`000_canonical_baseline.sql` is the source of truth, validated against a clean dev rebuild on 2026-06-12. Files in `archive/` are historical, superseded by the baseline. Never run the baseline against production — prod is already in this state; it's for rebuilding empty environments only.
