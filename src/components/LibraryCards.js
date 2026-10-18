// The Meal Library's card pieces — the occasion marks (icons, tints, paths), the
// grid card, the list row and the one action slot they share. Moved out of App.js
// verbatim on 2026-10-16 so a jest render can prove, in a real DOM, that no
// attribute on these elements carries a meal name or a count (session replay
// copies attributes; it masks only text) and that the accessible names hold.
// Importing App.js in jest is not possible (the Splunk recorder's webpack public
// path throws), which is why these live here and not beside the lens.
import { createElement } from "react";
import { displayTitle } from "../lib/displayTitle";

// OCCASIONS (061). Fixed display order for the rail and the Good-for chips:
// Dinner first because most meals are dinners. The singular word is what the
// card and the chips show; the rail pluralises Snacks / Sides / Appetizers.
const OCCASION_ORDER = ["dinner", "breakfast", "lunch", "snack", "side", "appetizer", "dessert"];
const OCCASION_WORD = { dinner: "Dinner", breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", side: "Side", appetizer: "Appetizer", dessert: "Dessert" };
const OCCASION_PILL = { ...OCCASION_WORD, snack: "Snacks", side: "Sides", appetizer: "Appetizers" };
// OCCASION MARKS (SPEC_meal_library_visual_v2 D5): one line icon + one tint per
// occasion, keyed on occasion[1] — the same element that drives the meta word.
// These are occasion marks, not photo placeholders: no camera glyph, no "add a
// photo" (Photos v1 D8 holds). Untagged meals get the neutral cream and a
// FALLBACK mark — a plate with fork and knife — never a blank band: a blank
// band read as a failed image load on dev (Dan, 2026-10-16 polish, amends D5).
// The icon is decorative (aria-hidden); the meta line names the occasion.
// Paths are 24-unit, 1.5 stroke, round caps — drawn to the mockup's artboard
// (the airlock carried a raster, so there were no paths to copy). Amendment A
// (2026-10-16): lunch and side redrawn (A1) from Dan's reference sheet as
// direction, not traced; appetizer is Dan's A2 SVG as given.
// Amendment A3 (2026-10-16): tints are grouping hints, the icon is the
// identifier — no two of the eight tiles may sit under CIE ΔE2000 6. The v2
// set failed five pairs (lunch/side 1.5, dinner/untagged 1.9, dinner/appetizer
// 3.7, dessert/appetizer 4.3, appetizer/untagged 4.4); this set clears every
// pair (min 6.11, breakfast/dinner) by moving dinner deeper, dessert to a
// cooler rose, side to a clearer green, appetizer to a deeper terracotta and
// untagged to a greyer neutral. Snack stays seafoam — apricot collided with
// appetizer (3.2). The pairwise table is in the harness report / ARCHITECTURE.
const OCCASION_TINT = {
  breakfast: { bg: "#F6EBC8", ink: "#8F7030" },
  lunch:     { bg: "#E3E8D6", ink: "#5F7048" },
  dinner:    { bg: "#EAD9C0", ink: "#8A6B4C" },
  snack:     { bg: "#DCE8E4", ink: "#47766B" },
  dessert:   { bg: "#F4DCE2", ink: "#9A5D52" },
  side:      { bg: "#CFE2BE", ink: "#4F6B3C" },
  appetizer: { bg: "#F2D0B5", ink: "#9A6442" },   // icon = Dan's A2
};
const UNTAGGED_TINT = { bg: "#F2EEE6", ink: "#8A6B4C" };
const OCCASION_PATHS = {
  // the untagged fallback — a plate between a fork and a knife
  untagged:  ["M12 12m-4.75 0a4.75 4.75 0 1 0 9.5 0a4.75 4.75 0 1 0-9.5 0", "M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0", "M4 3.5v17", "M2.5 3.5v3.25a1.5 1.5 0 0 0 3 0V3.5", "M20 3.5v17", "M20 3.5c-1.75 1.5-1.75 5.75 0 7.5"],
  // coffee cup: body, handle, two wisps of steam
  breakfast: ["M4 9.5h12v4.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z", "M16 11h1.25a2.25 2.25 0 0 1 0 4.5H16", "M8.5 6.5c0-1 .7-1.25.7-2.25", "M11.75 6.5c0-1 .7-1.25.7-2.25"],
  // sandwich (Amendment A1): two rounded slices with a wavy lettuce edge between
  lunch:     ["M5.5 5.5h13A2.5 2.5 0 0 1 21 8v1.5H3V8a2.5 2.5 0 0 1 2.5-2.5z", "M3 11.75c1 1.4 2 1.4 3 0s2-1.4 3 0 2 1.4 3 0 2-1.4 3 0 2 1.4 3 0 2-1.4 3 0", "M3 14h18v2.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"],
  // cloche: dome, knob, tray
  dinner:    ["M4.5 15a7.5 7.5 0 0 1 15 0z", "M12 7.5V5.75", "M3 18.25h18"],
  // apple: body, stem, leaf
  snack:     ["M12 8.25c-2.25-2-6-1.25-6 3.25 0 3.75 3 8 6 8s6-4.25 6-8c0-4.5-3.75-5.25-6-3.25z", "M12 8.25c0-1.75.9-2.75 2.25-3.25", "M12.5 6.75c1.25-1 2.75-.75 3.25.25-1.25 1-2.75.75-3.25-.25z"],
  // cupcake: frosting, cup, pleats
  dessert:   ["M6 12.5a3 3 0 0 1 1-5.75 4.25 4.25 0 0 1 8.25-1.25A3.25 3.25 0 0 1 18 12.5z", "M6 12.5h12l-1.5 7.25h-9z", "M10 12.5v7.25", "M14 12.5v7.25"],
  // side (Amendment A1): a bowl with leafy greens — bowl, foot, three leaves and a midrib
  side:      ["M3.5 12.5h17a8.5 8.5 0 0 1-17 0z", "M8.5 20.5h7", "M8 12.5c-1-3 0-5.5 2.5-6.5 1 2.5.5 4.5-2.5 6.5z", "M12 12.5c-.5-3.5 1-6.5 3.5-7.5.5 3-1 6-3.5 7.5z", "M12 12.5l2.5-5", "M15.5 12.5c1.5-2 3-2.5 4.5-2-.5 1.5-2 2.5-4.5 2z"],
  // appetizer — Dan's A2 (2026-10-16): the stick, the ring at the handle, an olive
  // and a cube on the pick. The olive and the cube are FILLED with the band's
  // tint so the pick reads as passing behind them (fill: "tint" → the slot bg).
  appetizer: [
    "M3.5 20.5L19 5",
    { t: "circle", cx: 19.8, cy: 4.2, r: 1.1 },
    { t: "circle", cx: 8.6, cy: 15.4, r: 3.6, fill: "tint" },
    { t: "circle", cx: 8.6, cy: 15.4, r: 1.1 },
    { t: "rect", x: 11.4, y: 6.3, width: 6.4, height: 6.4, rx: 1.4, transform: "rotate(45 14.6 9.5)", fill: "tint" },
  ],
};
// An entry is a path `d` string, or a shape descriptor { t, ...attrs } whose
// `fill: "tint"` resolves to the band's background.
function OccasionIcon({ occasion, size = 32, tint = "none" }) {
  const shapes = OCCASION_PATHS[occasion] || OCCASION_PATHS.untagged;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {shapes.map((s, i) => {
        if (typeof s === "string") return <path key={i} d={s} />;
        const { t, fill, ...attrs } = s;
        return createElement(t, { key: i, ...attrs, fill: fill === "tint" ? tint : fill });
      })}
    </svg>
  );
}
function occasionTint(meal) {
  const first = (meal?.occasion || [])[0];
  return OCCASION_TINT[first] || UNTAGGED_TINT;
}

// One card. Two real buttons, never nested: the coloured top ("Open {meal}")
// and the pill. The pill's slot follows the meal's STAGE (SPEC_meal_library_unplan,
// "one step back, never two"), read from boardCardState so This Week, Home and
// the library can never disagree:
//   none     → Plan (outline pill)            rows 1 and 6 — no open placement,
//                                             or cooked this load (afterglow)
//   planned  → ✓ This week (sand pill, LIVE)  rows 2–3 — Plan is still the latest
//                                             step; tapping UN-PLANS (skipMeal,
//                                             the board's Remove path, no list
//                                             links to zero). aria-label is fixed
//                                             copy, never the meal name.
//   toBuy    → "To buy" (text, inert, no ✓)   row 4 — the board's chip word;
//                                             changes happen on This Week
//   ready    → "✓ Ready" (text, inert)        row 5
// Pill = action, text = status: the shape says whether it does something.
// VISUAL v2 (SPEC_meal_library_visual_v2, 2026-10-16): the card is LIGHT — cream
// with a 1px warm border, dark text; dark brown is no longer a card fill (D1).
// Anatomy, a flex column: the SLOT (a short tinted band — the occasion mark
// lives here; a photo, when Photos v1 lands, takes the same slot at 132px) →
// the NAME in the card body, clamped to 3 lines with an ellipsis so a long
// imported title never sets the card's height (D2) → the strip: the meta line
// "{Occasion} · {n} items" (D6) and the round "+" (D7). The open button wraps
// the slot AND the name (tap anywhere above the strip opens the meal); the
// action is its sibling, never nested. The on-hand suffix lives in the meal
// sheet, not here (the card is too narrow and it is subordinate).
const CheckGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
);
const PlusGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);
// The meta line (D6): "{Occasion} · {n} items", or "{n} items" untagged — one
// line of chrome where there were two (the eyebrow and the count). "items"
// because "ingredients" does not fit the half-width card.
// Untagged + a setter on hand → Amendment A4's invitation in the occasion
// word's place: "+ Set type" (grid) / "+ Set meal type" (list), a real
// <button> that names the meal only in its aria-label, stops propagation and
// never sits inside the open button. It retires by behaviour — gone the moment
// a type is set. Without a setter (signed out) the untagged meta is "{n} items".
function LibraryMeta({ meal, variant = "grid", onSetType }) {
  const count = (meal.meal_ingredients || []).length;
  const first = (meal.occasion || [])[0];
  const items = `${count} ${count === 1 ? "item" : "items"}`;
  if (first && OCCASION_WORD[first]) return <>{OCCASION_WORD[first]} · {items}</>;
  if (!onSetType) return <>{items}</>;
  return (
    <>
      <button
        type="button"
        className="lib-settype"
        aria-labelledby={`lib-verb-settype meal-name-${meal.id}`}
        onClick={(e) => { e.stopPropagation(); onSetType(meal); }}
      >+ {variant === "list" ? "Set meal type" : "Set type"}</button>
      {/* The grid's half-width strip keeps the invitation alone on its line (Dan, 2026-10-16); the list has room for the count. */}
      {variant === "list" && ` · ${items}`}
    </>
  );
}
// The ONE action slot, shared by the grid card and the list row. Pill = action,
// text = status: none → the round "+" (D7, "Plan {meal}"), planned → the same
// round button in sand with a check (tapping UN-PLANS, fixed aria copy),
// toBuy / ready → inert text. Behaviour is Meal Library v1 + un-plan, unchanged.
function LibraryAction({ meal, stage, busy, canPlan, onPlan, onUnplan }) {
  if (!canPlan) return null;
  if (stage === "toBuy") return <span className="lib-stage">To buy</span>;
  if (stage === "ready") return <span className="lib-stage"><CheckGlyph />Ready</span>;
  if (stage === "planned") {
    return (
      <button
        type="button"
        className="lib-plan planned"
        disabled={busy}
        aria-labelledby="lib-verb-unplan"
        onClick={() => { if (!busy) onUnplan(meal.id); }}
      ><CheckGlyph /></button>
    );
  }
  return (
    <button
      type="button"
      className="lib-plan"
      disabled={busy}
      aria-labelledby={`lib-verb-plan meal-name-${meal.id}`}
      onClick={() => { if (!busy) onPlan(meal.id); }}
    >{busy ? <span className="lib-plan-wait" aria-hidden="true">…</span> : <PlusGlyph />}</button>
  );
}
// The photo path (O3): dormant until Photos v1 lands. `meal.cardPhotoUrl` is the
// client-side seam — a resolved URL for the meal's card photo (the newest live
// one, Photos D2). No read sets it today, so every slot is the 56px tint.
// `thumb` is the list row's 60×60 rounded square (icon at 30); otherwise the
// card's band (icon at 32).
// `chip` (grid card only): the "✓ Ready" status as a small pill in the band's
// top-right corner, so the strip's meta line stays on one line (Dan, 2026-10-16).
// It sits inside the open button, so it is decorative here; the card's
// aria-label is unchanged and the list row keeps its inert text label.
const ReadyChip = () => <span className="lib-ready" aria-hidden="true"><CheckGlyph />Ready</span>;
function LibrarySlot({ meal, thumb = false, chip = false }) {
  const base = (thumb ? "lib-thumb" : "lib-slot") + (chip ? " has-chip" : "");
  if (meal.cardPhotoUrl) {
    return <span className={`${base} photo`} aria-hidden="true"><img className="lib-slot-img" src={meal.cardPhotoUrl} alt="" />{chip && <ReadyChip />}</span>;
  }
  const tint = occasionTint(meal);
  return (
    <span className={base} style={{ background: tint.bg, color: tint.ink }} aria-hidden="true">
      <OccasionIcon occasion={(meal.occasion || [])[0]} size={thumb ? 30 : 32} tint={tint.bg} />
      {chip && <ReadyChip />}
    </span>
  );
}
// The list row (D8): thumbnail · a 2-line title + the meta line · the "+" at
// 48px. Same two buttons as the card (open, action), same stage rule.
// The row is a 3-column grid (thumb · name / meta · action) so the meta line can
// hold Amendment A4's invitation as a SIBLING of the open button — a button
// inside a button is invalid and would bubble into "Open". The open button is
// the name; its ::before covers the thumbnail column, so tapping the picture
// still opens the meal. The meta text line itself is not a tap target.
function LibraryRow({ meal, stage, busy, canPlan, onPlan, onUnplan, onOpen, onSetType }) {
  return (
    <div className="lib-row">
      <LibrarySlot meal={meal} thumb />
      <button
        type="button"
        className="lib-rbody"
        aria-labelledby={`lib-verb-open meal-name-${meal.id}`}
        onClick={() => onOpen(meal)}
      >
        <span id={`meal-name-${meal.id}`} className="lib-rname">{displayTitle(meal.name)}</span>
      </button>
      <span className="lib-rmeta"><LibraryMeta meal={meal} variant="list" onSetType={onSetType} /></span>
      <LibraryAction meal={meal} stage={stage} busy={busy} canPlan={canPlan} onPlan={onPlan} onUnplan={onUnplan} />
    </div>
  );
}
function LibraryCard({ meal, stage, busy, canPlan, onPlan, onUnplan, onOpen, onSetType }) {
  // Ready moves up into the band as a chip (grid only); the strip then carries the meta alone.
  const readyChip = canPlan && stage === "ready";
  return (
    <div className="lib-gcard">
      <button
        type="button"
        className="lib-gbody"
        aria-labelledby={`lib-verb-open meal-name-${meal.id}`}
        onClick={() => onOpen(meal)}
      >
        <LibrarySlot meal={meal} chip={readyChip} />
        <span id={`meal-name-${meal.id}`} className="lib-gname">{displayTitle(meal.name)}</span>
      </button>
      <div className="lib-gstrip">
        <span className="lib-gmeta"><LibraryMeta meal={meal} variant="grid" onSetType={onSetType} /></span>
        {!readyChip && <LibraryAction meal={meal} stage={stage} busy={busy} canPlan={canPlan} onPlan={onPlan} onUnplan={onUnplan} />}
      </div>
    </div>
  );
}
function LibraryItem({ kind, ...props }) {
  return kind === "list" ? <LibraryRow {...props} /> : <LibraryCard {...props} />;
}

export {
  OCCASION_ORDER, OCCASION_WORD, OCCASION_PILL, OCCASION_TINT, UNTAGGED_TINT, OCCASION_PATHS,
  OccasionIcon, occasionTint, CheckGlyph, PlusGlyph,
  LibraryMeta, LibraryAction, ReadyChip, LibrarySlot, LibraryRow, LibraryCard, LibraryItem,
};
