// Cook dates for the recipe view (SPEC_recipe_view Amendment A4, 2026-10-18).
// A cook within the last week reads relative — "tonight", "yesterday", then the
// weekday ("Sunday"); older cooks read weekday + date — "Sun, Sep 27" — with the
// year added only when it is not this year. Pure: `now` is a parameter so the
// relative words can be proven in jest. Never a person (D10).
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function cookDate(iso, now = new Date()) {
  if (iso == null || iso === "") return "";   // new Date(null) is the epoch, not an error
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  if (days === 0) return "tonight";
  if (days === 1) return "yesterday";
  if (days > 1 && days < 7) return WEEKDAY[d.getDay()];
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, sameYear
    ? { weekday: "short", month: "short", day: "numeric" }
    : { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// The same date where it STARTS a line — a "Your cooks" row (Dan, 2026-10-21): "Tonight", "Yesterday",
// "Sunday", "Sun, Sep 27". Mid-sentence uses ("Last cooked tonight", "Cooked tonight · Dan") keep cookDate.
export function cookDateStart(iso, now = new Date()) {
  const d = cookDate(iso, now);
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : d;
}

// The meta line's cook history: "Last cooked {date}", "· {N} times" at 2+;
// empty when never cooked (no cook line at all).
export function cookHistoryLine(lastCookedAt, count, now = new Date()) {
  if (!lastCookedAt || !(count > 0)) return "";
  const when = cookDate(lastCookedAt, now);
  if (!when) return "";
  return count >= 2 ? `Last cooked ${when} · ${count} times` : `Last cooked ${when}`;
}

export default cookDate;
