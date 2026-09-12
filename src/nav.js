// ── The Helm: one nav grammar, two renderers (SPEC_nav_helm.md, D6) ──────────
// NAV_DOORS is the single source of truth for the app's doors — icons, order and
// names cannot drift between the phone pill (<Helm />) and the wide rail
// (<Rail />). The same array is meant to become the fleet nav grammar for the
// other Our___ apps, so keep it data, not JSX.
//
// `view` values are the existing tab state values in App.js: Browse has always
// been "input" and Shop "list" — do not "tidy" them; every view === "…" branch
// in App.js keys on them.

import { useEffect, useState } from "react";

// Icons: the three existing tab glyphs lifted verbatim (same paths, currentColor)
// plus the new Home house outline from the mockup (1.6 stroke).

export function HomeIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

// Plan — horizon icon (was the Plan tab's SVG).
export function PlanIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 14" fill="none" aria-hidden="true">
      <circle cx="9" cy="5" r="2" fill="currentColor" />
      <line x1="9" y1="1" x2="9" y2="0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12.5" y1="2.5" x2="13.5" y2="1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5.5" y1="2.5" x2="4.5" y2="1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="14" y1="5" x2="15.5" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4" y1="5" x2="2.5" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1 9 Q9 4 17 9" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <line x1="0" y1="11" x2="18" y2="11" stroke="currentColor" strokeWidth="0.75" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

// Browse — grid icon (was the Browse tab's SVG).
export function BrowseIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// Shop — basket icon (was the Shop tab's SVG).
export function ShopIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M6 7 Q6 3 9 3 Q12 3 12 7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M2 7 L3.5 15 Q5 16.5 9 16.5 Q13 16.5 14.5 15 L16 7 Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      <line x1="2.5" y1="10.5" x2="15.5" y2="10.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

// D7: four doors from day one. Home routes to a placeholder until HOME v1 —
// the pill's shape is what households learn, and adding a door later shifts
// every other door under the thumb.
export const NAV_DOORS = [
  { key: "home",   label: "Home",   view: "home",  Icon: HomeIcon },
  { key: "plan",   label: "Plan",   view: "plan",  Icon: PlanIcon },
  { key: "browse", label: "Browse", view: "input", Icon: BrowseIcon },
  { key: "shop",   label: "Shop",   view: "list",  Icon: ShopIcon, badge: true },
];

// D5: past this width the pill unmounts and the same doors render as a rail.
export const RAIL_MIN_WIDTH = 700;
export const WIDE_QUERY = `(min-width: ${RAIL_MIN_WIDTH}px)`;

// JS media query (not CSS show/hide) so that exactly ONE of <Helm /> / <Rail />
// is mounted at any width — the pill's mount-time "no animation" guard and its
// fixed-position footprint both depend on it truly unmounting on wide.
export function useMediaQuery(query) {
  const get = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);
  return matches;
}

// D9′ (v2, amended 2026-09-12) — the pill is compact EXACTLY when the door's
// header controls are off-screen. Position-based, not direction-based: the
// v2 direction rule let a small upward scroll restore the full pill mid-list,
// leaving no + on screen while the header row was still out of sight.
//
// `controlRow` is the door's control row element (Shop: the [count] [lens] [+]
// [Wrap up] row; Browse: a sentinel at the bottom of the search + chips block —
// the search bar itself is sticky and never leaves; Plan: a sentinel where the
// lens row will sit), or null when the door has none (Home never compacts).
// Compact once the row's bottom is `margin` px above the viewport top; full
// again once it is `margin` px back inside — an 8px band of hysteresis, no
// direction tracking, no deadband. rAF-throttled; recomputed on scroll, on
// resize and whenever the row element changes (door switch). Negative offsets
// (iOS rubber-band) only ever move the row DOWN, so they can't compact it.
export function useScrollCompact(controlRow, { margin = 8 } = {}) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!controlRow) { setCompact(false); return undefined; }
    let ticking = false;
    let compactNow = null;
    const set = (v) => { if (v !== compactNow) { compactNow = v; setCompact(v); } };
    const update = () => {
      ticking = false;
      const bottom = controlRow.getBoundingClientRect().bottom;
      if (bottom < -margin) set(true);
      else if (bottom > margin) set(false);
      else if (compactNow === null) set(false);   // first read inside the band: full
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [controlRow, margin]);
  return compact;
}
