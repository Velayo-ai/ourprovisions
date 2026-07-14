# SPEC — docs/ declutter + spec lifecycle folders

**Scope:** Velayo OS (repo hygiene across `ourprovisions` + `velayo-os`).
**Type:** File-move manifest with decision trail. No product code, no DB.
**Authority:** Claude Code executes. This chat proposes destinations; **Claude Code confirms each file's real path + disposition against `git log` before moving.** Design-chat inference is a proposal, not authority (standing rule from 2026-07-10 reorg design).

---

## Why this spec exists

`ourprovisions/docs/` is 44 items, mostly flat. A `specs/` folder and a `mockups/` folder **already exist** (empty or partially populated), but nearly every product spec still sits loose at `docs/` root. The 3-tier lifecycle (`active`/`built`/`retired`) is design-intent; the subfolders under `specs/` were **never created**. This pass creates the three subfolders inside the existing `specs/`, sorts the loose specs into them, moves loose mockups into the existing `mockups/`, and relocates two misfiled stragglers.

**Two misfiled files found at `docs/` root (not specs):**
- `007_dev_restore_role_grants.sql` → belongs in `ourprovisions/migrations/` (top-level, exists). A migration loose in docs/.
- `DEV_SETUP.md` → repo-onboarding reference. Leave at `docs/` root (not clutter, not a spec).

Two sorting axes, applied in order:
1. **Scope** — OurProvisions product spec vs Velayo OS process doc. OS docs leave the ourprovisions repo entirely.
2. **Lifecycle** (product specs only) — `active` (not yet shipped / still open), `built` (shipped + verified; kept as forensic record, never deleted), `retired` (superseded; design changed).

**Bucket rules (the non-obvious calls):**
- Diagnosis→fix pairs for one shipped bug (e.g. `false_removal_banner_race` v1+v2, `duplicate_household_repro`+`_fix`) → **both `built/`**. Retired is for design that *changed*, not a two-document trail of one fix.
- Deferred ≠ retired. Receipt specs (Phase 3, unbuilt) are current design → **`active/`**.
- A spent handoff whose build shipped → **`retired/`** (`DECLUTTER_BUILD_HANDOFF.md`).

---

## Target structure

```
ourprovisions/
  CLAUDE.md                    ← STAYS at repo root (do NOT move)
  README.md                    ← stays
  qa/                          ← already exists
    prod_test_plan.md          ← route here
    agent_test_harness.md      ← route here (may already be here as qa/agent_test_harness.md)
  migrations/                  ← already exists
    007_dev_restore_role_grants.sql  ← MOVE here from docs/ root (misfiled migration)
  docs/
    SESSION_LOG.md  ROADMAP.md  ARCHITECTURE.md   ← canonicals stay at docs/ root
    EVIDENCE_grocery_savings.md                    ← stays at docs/ root for now (evidence, not a spec)
    DEV_SETUP.md                                   ← stays at docs/ root (repo onboarding ref)
    specs/                       ← already exists
      active/                    ← CREATE
      built/                     ← CREATE
      retired/                   ← CREATE
    mockups/                     ← already exists; move loose mockups in, keep flat (KISS)
      cycle_dual_readout.html
      mockup_invite_flow.html · mockup_add_to_stepper.html · mockup_notice_translucent.html
      mockup_prefs_textsize.html · mockup_receipt_review.html

velayo-os/
  docs/
    DESIGN_CHAT_handoff_prompt.md   ← route here
    velayo_os_flight_checklist.html ← route here
```

---

## MOVE MANIFEST

### → velayo-os/docs/ (OS scope — leave ourprovisions)
| file | note |
|---|---|
| DESIGN_CHAT_handoff_prompt.md | session-ritual machinery |
| velayo_os_flight_checklist.html | OS by name |

### → ourprovisions/qa/ (already exists)
| file | note |
|---|---|
| prod_test_plan.md | OurProvisions QA |
| agent_test_harness.md | likely already at qa/ — verify, dedupe if so |

### → ourprovisions/migrations/ (already exists)
| file | note |
|---|---|
| 007_dev_restore_role_grants.sql | misfiled migration loose in docs/ |

### → ourprovisions/docs/mockups/ (already exists; keep flat)
Any loose `mockup_*.html` + `cycle_dual_readout.html` at docs/ root → move into `mockups/`. Some may already be there — verify + dedupe. **No lifecycle subfolders for mockups** (KISS; the approved mockup is design-truth regardless of folder). This resolves the prior open question.

### → ourprovisions/docs/specs/built/ (shipped + verified)
SPEC_declutter_cycle · SPEC_add_to_stepper · SPEC_invite_share_flow · SPEC_join_activates_household · SPEC_join_activates_household_ADDENDUM_reopen · SPEC_list_text_size · SPEC_search_row_and_price_gate · SPEC_swipe_close_gesture · SPEC_swipe_close_pointerevents_fix · SPEC_swipe_search_parity · SPEC_consolidate_helpers · SPEC_duplicate_household_repro · SPEC_duplicate_household_fix · SPEC_false_removal_banner_race · SPEC_false_removal_banner_race_v2 · SPEC_household_indicator · SPEC_member_display_name · SPEC_name_change_hang · SPEC_invite_paste_autoswitch · SPEC_join_banner_autodismiss · SPEC_stale_invite_link · SPEC_hide_delete · SPEC_shop_swipe_remove · SPEC_delete_household · SPEC_create_household_from_template · SPEC_category_delete_blank_catalog · SPEC_checkpresence_diagnostic · SPEC_offline_retry · SPEC_layer2_removal_notice

### → ourprovisions/docs/specs/active/ (not yet shipped / open)
SPEC_dispatches · SPEC_feedback_bridge · SPEC_pwa_install_coachmark *(Beat 0, in-flight)* · SPEC_new_user_coldstart · SPEC_rum_unmask · SPEC_receipt_use_cases · SPEC_receipt_vision_extraction · SPEC_receipt_reconcile · SPEC_receipt_import *(Phase 3)*

### → ourprovisions/docs/specs/retired/ (superseded)
| file | why |
|---|---|
| SPEC_filter_show_hide | explicitly retired at the declutter merge (SESSION_LOG line ~327/334) |
| DECLUTTER_BUILD_HANDOFF | spent handoff; the build shipped + prod-verified |

---

## Verification (Claude Code, before moving each file)
1. **Confirm real current path** — the file may already live in `qa/`, `handoff/`, or `migrations/`, not `docs/`. The Project-Knowledge mirror is flat and does not reflect true location.
2. **Confirm disposition against `git log`** — a spec's bucket is decided by whether its feature shipped, not its filename. Spot-check any `built/` entry whose merge commit you can't find; if unshipped, it's `active/`.
3. **Dedupe** — if `agent_test_harness.md` already exists at `qa/`, the docs/ copy is a mirror artifact; keep one.
4. **One commit**, OS-scoped: `chore(docs): create spec lifecycle folders + sort specs`.

## Resolved this session
- **Mockups** get no lifecycle folders — the existing `docs/mockups/` stays flat (KISS). The approved mockup is design-truth by content, not by folder position. Loose mockups move in; spec ↔ mockup linkage lives in the spec text, not the directory tree.
