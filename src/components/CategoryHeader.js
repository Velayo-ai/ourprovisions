// A Browse section header: the emoji + tracked uppercase label (.cat-title) on the left, an
// optional action on the right, the thin gold rule beneath.
//
// Lifted, unchanged, out of Browse's category blocks (2026-11-11) so the landscape Staples
// view's header is the SAME header, not a look-alike: portrait's "🥦 PRODUCE … ＋ New item"
// and landscape's "⭐ STAPLES … Tap to add · Hold to remove" are one component. The values
// below are the ones the inline JSX carried; `style` only lets a caller adjust the spacing
// around it. .cat-title's own rule lives in App.js's style block.
export const CATEGORY_HEADER_ACTION = {
  background: "none", border: "none", fontFamily: "'Lato', sans-serif",
  fontSize: "12.5px", color: "#8A5F3A", cursor: "pointer",
  letterSpacing: "0.5px", padding: "0",
};

export function CategoryHeader({ title, children, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #E8D5B7", paddingBottom: "8px", marginBottom: "12px", ...style }}>
      <div className="cat-title" style={{ border: "none", padding: 0, margin: 0 }}>{title}</div>
      {children}
    </div>
  );
}
