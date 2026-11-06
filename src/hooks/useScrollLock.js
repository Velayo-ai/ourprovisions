import { useEffect } from "react";

// useScrollLock — while `active`, the page behind a sheet cannot scroll (2026-11-05, the Add sheet:
// the list scrolled behind it and the rubber-band fed visualViewport scroll events into the lift).
//
// Two scroll roots, as scrollToTop knows: at ≥ COLUMN_MIN_WIDTH (desktop, and a phone on its
// side) the .phone-scroll column scrolls and the document does not; below it (a phone upright) the
// column is a plain block and the document scrolls. So both are locked: the column by ref (passed
// down from ShoppingListApp; no document query) and the body. Each gets overflow hidden, and its
// previous inline value back on release. The column's scrollTop is read before the lock and put
// back after the release, so closing the sheet leaves the list exactly where it was.
//
// iOS ignores overflow for touch, so this is half the fix: the sheet's scrim is touch-action none
// (see .add-sheet-scrim), which is what keeps a drag on the dimmed area off the page.
export function useScrollLock(active, rootRef) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return undefined;
    const root = rootRef && rootRef.current;
    const body = document.body;
    const prevBody = body.style.overflow;
    const prevRoot = root ? root.style.overflow : "";
    const top = root ? root.scrollTop : 0;
    body.style.overflow = "hidden";
    if (root) root.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevBody;
      if (root) {
        root.style.overflow = prevRoot;
        if (root.scrollTop !== top) root.scrollTop = top;
      }
    };
  }, [active, rootRef]);
}

export default useScrollLock;
