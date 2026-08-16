# SPEC — Household management redesign + OurBanner (Phase I)

**Status:** Active — designed, ready to build
**Scope:** OurProvisions
**Phase:** I of II (Phase II = Events; see ROADMAP)
**Migration:** 024 (OurBanner) — **assign at point-of-build; check `migrations/` for true high-water mark first**
**Approved mockup:** `docs/mockups/mockup_household_manage_FINAL3.html` (bare-pencil, no pill) — **tiebreaker if this prose disagrees**
**Builds on:** `SPEC_household_photo_header.md` (OurBanner — photo/framing/wordmark, migration 024, all its decisions D1–D8 stand)
**Design session:** 2026-07-18

---

## Why these two ship together

The management redesign and OurBanner share one artifact: **the Edit household sheet**. The
redesign's pencil opens it; OurBanner fills it. Building management without the photo would
ship an Edit sheet we immediately reopen. They are one build.

---

## The model (this is the load-bearing idea)

**Collection → selected → scoped detail.** One shape, and Phase II (Events) reuses it:

- **Above the line — households (CRUD).** Your Households list. Read = the list; Update +
  Delete = the active row's pencil → Edit sheet. Create = button below the list.
- **Below the line — this household's membership (detail).** Roster + Invite, scoped to the
  active household. Recomputes on selection, same class as the filter-reset rule.

One selection drives both zones. Build Phase I so it does not fight Phase II: leave conceptual
room for a future "Your Events" sibling section; do not build Event structures now.

---

## Decisions

### D1 — Household CRUD lives above the line; membership below
The cut is **the household as an entity** (name, photo, existence) vs. **the people in it**.
Edit and Delete act on the entity → above. Invite and the roster act on people → below.

### D2 — The active row carries a single affordance: a bare pencil
Only the selected (active) household shows the pencil, at the row's **right edge**, as a
**bare glyph** — no background plate — matching the trash icon on member rows. Row-level
actions across the sheet are one pattern: bare icon, right edge.

### D3 — Delete lives *inside* the Edit household sheet, not in the list
Mirrors item deletion: you go *into* the thing to destroy it; the destructive action is not a
peer sitting in the list. Delete sits at the bottom of the Edit sheet, in its own danger zone,
below a divider, with a plain consequence line: *"Deletes {name} for everyone aboard. This
can't be undone."*

**This refines `SPEC_household_photo_header.md` D2**, which kept Delete in the switcher to keep
it away from the pencil's edit surface. Under the entity/membership model, Delete and the
household's edit-actions belong together — they are all operations on the household. The
Edit sheet is where household-CRUD lives. **Permission is unchanged: creator-only.**

### D4 — "Created by you" resolves to creator-gated Delete, not a header label
It was near-decoration as a header subtitle. Its real meaning is *who can delete*. So it is not
a label in the membership header; it surfaces as the **creator-only visibility of Delete**
inside the Edit sheet. Non-creators open Edit, adjust photo/name/wordmark, and simply do not
see Delete. (Phase II: the same concept becomes an event's **host**.)

### D5 — Invite hands off to the system share sheet
Tapping "Invite someone aboard" calls the OS share sheet (`navigator.share()` on the installed
PWA) with the pre-filled "come aboard" message. **No in-app share UI, no persistent banner.**
The old banner bug (it rendered in the main scroll and lingered after sending) is deleted by
construction: there is no in-app view to linger. "Copy link instead" is removed — the share
sheet already offers Copy.

Pre-filled payload: *"Come aboard my OurProvisions list — join {household} and it gets smarter
as we go. {invite-url}"* Verify the app calls `navigator.share()`, not a self-rendered sheet;
if it currently self-renders, this is also a code simplification.

### D6 — Household rows are name-only; no monogram, no icon
Rows are just the name (plus ACTIVE tag / pencil on the active one). Earlier drafts used a
monogram or anchor glyph as a photo-less placeholder; both are removed. The name is the
identity. The photo lives in the header and the Edit sheet, not repeated in the switcher.

### D7 — Both zones share one clay eyebrow rhythm
Above: `YOUR HOUSEHOLDS`. Below: `SACANDAGA · MEMBERS` (household name · MEMBERS, single clay
eyebrow, uppercased). The membership zone drops the prior Playfair "Members" headline and the
stacked "Created by you · N aboard" subtitle — those made the bottom zone heavier than the top.
One eyebrow, then the list, both times. No member count in the eyebrow.

### D8 — OurBanner Edit sheet contents (unchanged from `SPEC_household_photo_header.md`)
The Edit household sheet, top to bottom: live header preview (drag to reposition) · Zoom slider
(100–320) · Replace / Remove · Wordmark segment `Large | Small | Hidden` (**rendered only when a
photo exists**, per OurBanner D3; default **Large**, per D4) · Household name field · permission
helper *"Anyone in the household can change the photo, the name, and the wordmark."* · **then the
Delete danger zone (D3 above, creator-only).** Cancel / Save commits framing + wordmark + name
together.

**Empty state (photo-less household), per OurBanner D8:** preview shows the *real* espresso
header — wordmark large, nothing invented in the band — with a **Choose a photo** button below.
Zoom, Replace/Remove, and the Wordmark segment are hidden until a photo exists.

---

## Photo identity generalizes beyond households (Phase II seed — note, don't build)

OurBanner's columns land on `households` in migration 024 as specced. But the photo is really
**context identity**, not a household-only feature. Phase II standalone events (no parent
household) lean entirely on their own photo for identity. **Do not re-architect 024** — ship it
on households. Just record that photo/framing/wordmark is intended to generalize to a "context"
in Phase II, so Events inherits rather than reinvents it.

---

## Build sequence (for Claude Code)

1. Migration 024 (OurBanner schema) → **dev**, verify (authenticated non-member + anon, per
   OurBanner RLS/storage notes; SQL editor bypasses RLS and cannot confirm policies).
2. Edit household sheet: photo preview + zoom + replace/remove + wordmark segment (photo-gated)
   + name field + **creator-only Delete danger zone**. Both states (has-photo / empty).
3. Two-zone management sheet: Your Households (name-only rows, bare pencil on active row) above;
   `{household} · MEMBERS` roster + Invite below.
4. Invite → `navigator.share()` hand-off; remove any self-rendered share UI + "Copy link".
5. Dev-verify the whole flow → **prod**. One tested commit per step; dev→main held until Phase I
   fully validated.

EXIF normalization, storage bucket, and RLS are all per `SPEC_household_photo_header.md` — no
change here.

---

## Verification (Phase I additions to OurBanner's list)

- [ ] Active row shows a bare pencil at its right edge; inactive rows show only the name
- [ ] Pencil opens Edit household; Delete sits at the bottom in its danger zone
- [ ] Non-creator opens Edit, can change photo/name/wordmark, does **not** see Delete
- [ ] Invite opens the OS share sheet with pre-filled copy; nothing renders in-app; nothing
      lingers after dismiss
- [ ] No "Copy link instead" button anywhere
- [ ] Rows are name-only — no monogram/anchor/icon on the left
- [ ] Both eyebrows read as one rhythm: `YOUR HOUSEHOLDS` / `{HOUSEHOLD} · MEMBERS`
- [ ] Membership zone recomputes when the active household changes
- [ ] All OurBanner verification items (EXIF, framing persistence, wordmark states, switch-swap,
      RLS) still pass

---

## Out of scope (Phase II — Events)

The Context model (households + events as one entity, optional parent + optional deadline),
hosted vs. standalone events, temporary non-inheriting event membership, and photo-as-context-
identity are **Phase II**. Captured in ROADMAP; not built here. Motivating standalone case:
Cassie's bachelorette at a hotel — no household, sits at top level, photo *is* its identity.
