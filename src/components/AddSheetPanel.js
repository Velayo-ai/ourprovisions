import { useSheetDrag } from "../hooks/useSheetDrag";

// AddSheetPanel — the Add sheet's container, with pull-down-to-close (2026-11-05). The grab bar
// was decorative; this adopts useSheetDrag the way SheetPanel does, no new gesture.
//
// A component, not the hook in ProvisionsApp, for SheetPanel's reason: the drag offset and the
// "leaving" slide are hook state and must die with the sheet, or the next open starts off-screen.
//
// Where the handlers go. Since b1a7753 the sheet itself never scrolls; .add-sheet-body does. The
// hook reads "at top" from e.currentTarget.scrollTop and keeps touch-action in step from onScroll,
// and React does not bubble scroll events, so the handlers must sit on the scroller itself. They
// are spread twice, with no change to the hook:
//   - on the head (grab, title, search row), minus onScroll: the head never scrolls, its
//     scrollTop is always 0, so a pull there always arms and closes. touch-action none, so iOS
//     hands the pull to the pointer stream instead of trying to scroll a fixed page;
//   - on the body, whole: a press that starts scrolled down is a native scroll (touch-action
//     pan-y), one at the top arms and closes, and up from the top scrolls by hand.
// A scrollRef option on the hook was the other way. It is more code: the hook would need to know
// whether the press began inside that region, or a pull on the handle with the results scrolled
// would refuse to close, and onScroll would still have to be attached to the inner region by hand.
//
// One transform: the keyboard lift and the drag share translateY. Leaving is translateY(110%).
// Inline transition only while dragging (none) or leaving (the hook's slide); otherwise the class's
// 150ms keyboard transition, which is none under reduced motion.
export function AddSheetPanel({ onClose, inset = 0, style, head, children }) {
  const drag = useSheetDrag(onClose);
  const { onScroll, ...press } = drag.handlers;
  const transform = drag.leaving ? "translateY(110%)" : `translateY(${drag.dy - inset}px)`;
  return (
    <div
      className="add-sheet"
      onClick={(e) => e.stopPropagation()}
      style={{
        ...style,
        transform,
        ...(drag.dragging || drag.leaving ? { transition: drag.style.transition } : {}),
      }}
    >
      <div className="add-sheet-head" style={{ touchAction: "none" }} {...press}>{head}</div>
      <div className="add-sheet-body" style={{ touchAction: drag.style.touchAction }} {...drag.handlers}>
        {children}
      </div>
    </div>
  );
}

export default AddSheetPanel;
