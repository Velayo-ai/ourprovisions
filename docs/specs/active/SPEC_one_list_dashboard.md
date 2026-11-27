# SPEC — One list: the Splunk dashboard ("Is the list easier to build?")

**Scope:** OurProvisions · telemetry + a Splunk Observability dashboard · no migration
**Status:** Design (design chat 2026-11-27, Dan). The code half rides **Slice 3** of `SPEC_one_list.md`; the dashboard is built at the prod promotion of Slices 1–3.
**Companion to:** `SPEC_one_list.md` (Telemetry section).

---

## Why

One list, one screen is an experiment ("worth a shot"). Without a place to read it, the events added in Slices 2–3 are just spans in session timelines. This dashboard answers three questions, two weeks after the promotion:

1. **Do people build the list with the picker?** Or do they still go to Browse to add one known thing?
2. **Does the picker confuse anyone?** Opens with nothing added, slow visits.
3. **Do people want quantity in the picker?** Taps on items already ✓ on the list.

Plus, once Slice 3 ships: **do first-timers get going?** Which guide row they pick, and how long until their first item.

The numbers say *what* happened. Watching Helen and Elly says *why*. Read them together.

## How the events reach a chart

Splunk RUM turns a custom span into the metric **`rum.workflow.count`** only when it carries **`workflow.name`** (the invite-health pattern, ARCHITECTURE "invite health", 2026-11-11). Its other attributes become chartable **dimensions** only once they are **indexed tags** in Splunk. So:

**Code (rides Slice 3):**
- Every one-list event sets `workflow.name` to its own event name: `picker_opened`, `picker_closed`, `picker_tap_on_listed`, `item_added_to_list`, `list_guide_cta`, `first_item_added`, `list_welcome_dismissed`. (`item_added_to_list` already exists for Browse; adding `workflow.name` there changes no behaviour.)
- **Bucket the counts, never raw numbers** (low cardinality, and nothing identifying):
  - `picker_closed.added` → also send `added_bucket`: `0` · `1` · `2-4` · `5+`.
  - `open_s` is already a bucket (`lib/listPicker` `openBucket`); keep it.
  - `first_item_added.s` → a bucket (same shape as `open_s`).
- **Never a dimension:** `household_id`, `catalog_item_id`, any name. They stay span attributes for session drill-down only.

**Splunk (Dan, once, in Observability settings):** index these tags for RUM: `workflow.name` (already indexed), `source`, `door`, `from`, `added_bucket`, `open_s`, `choice`, `browse_kind`, `after`. If a tag isn't indexed, its chart shows one undivided line. That's the tell.

## The dashboard: "One list — is it easier?"

Environment **prod**. (Dev is full of the harness's Cody Test House walks; read dev only to check that events arrive.) Default range: 14 days, daily rollup.

| # | Chart | Metric / filter | Split by | Reads |
|---|---|---|---|---|
| 1 | **Where list items come from** | `rum.workflow.count`, `workflow.name = item_added_to_list` | `source` (picker · browse · meal · ask) | Stacked daily bars. The headline: is `picker` a real share of adds? |
| 2 | **Picker adds by door** | same, `source = picker` | `door` (list · browse · guide) | Is the List's + Add the main door, or the Helm's +? |
| 3 | **How people open the picker** | `workflow.name = picker_opened` | `from` (list_add · helm · guide) | Should agree with 2. Opens that don't become adds show up in 4. |
| 4 | **Picker visits with nothing added** | `picker_closed`, `added_bucket = 0` ÷ all `picker_closed` | — | A % line. **The confusion signal.** |
| 5 | **Items per picker visit** | `picker_closed` | `added_bucket` | Bars. Mostly `1` = one-thing-at-a-time; `2-4` / `5+` = building a list (the "write it" appetite). |
| 6 | **How long the picker stays open** | `picker_closed` | `open_s` | Bars. Long visits with few adds = searching and not finding. |
| 7 | **Trying to add a second one** | `picker_tap_on_listed` ÷ (`item_added_to_list`, `source = picker`) × 100 | — | Taps on ✓ rows per 100 picker adds. **The quantity signal.** |
| 8 | **First-timers: which way in** *(Slice 3)* | `list_guide_cta` | `choice` (add · browse · plan), then `browse_kind` (aisles · staples) | Which intention new people pick. |
| 9 | **First-timers: time to first item** *(Slice 3)* | `first_item_added` | `s` bucket, split by `after` (guide · welcome) | Do people get going in seconds, or wander? |
| 10 | **Welcome seen** *(Slice 3)* | `list_welcome_dismissed` | — | A daily count; mostly existing members on rollout, then each new member. |

## How to read it (starting thresholds, not science)

These are first guesses to argue with after two weeks, not alarms.

- **Picker share of manual adds (chart 1, picker ÷ (picker + browse))** rising over the two weeks: the picker is taking over "I know what I need". Flat near zero: people never found it, so check charts 2–3 and watch someone use it.
- **Empty visits (chart 4) above ~30%:** something in the picker isn't clear, or the item isn't there. Look at chart 6. Many long empty visits point to search misses: the case for "Write it" and better matching.
- **Mostly `2-4` / `5+` per visit (chart 5):** people are writing lists one tap at a time. Raise "Write it" (multi-line) in NEXT.
- **✓-taps above ~10 per 100 picker adds (chart 7):** people want a second one. Revisit R8 (e.g. a second tap adds one more).
- **Guide choices (chart 8):** no target. It tells us which intention new households have, and whether "Browse the aisles" (no staples yet) gets used at all.
- **Time to first item (chart 9) mostly under 30 s:** the guide works. A long tail: watch a new person try it.

## Detectors

One, cheap, after the promotion: **"Picker silent"**: `picker_opened` on prod is 0 for 24 h while `item_checked_off` is not. That would mean the picker broke or vanished. Max Delay 1m, like the invite detectors.

## Build and verify

- **Code:** in the Slice 3 prompt: `workflow.name` on every one-list span, `added_bucket`, the `first_item_added` bucket; Jest pins the attribute sets; the prod-config masking test still passes.
- **Verify on dev:** after Cody's walk, every one-list event appears in a dev session timeline with `workflow.name` and its bucketed labels, and no names.
- **Dashboard + detector:** built on prod data after the Slices 1–3 promotion, by Dan in Splunk Observability (or by Cody if it has API access, as with the invite detectors). The tags are indexed first.
- **Read it:** two weeks after the promotion, together with a session watching Helen and Elly.
