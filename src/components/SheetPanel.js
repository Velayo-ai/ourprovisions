import { useSheetDrag } from "../hooks/useSheetDrag";

// SheetPanel — the container of a bottom sheet: dialog semantics + swipe-down
// to dismiss, in one element (2026-10-05). It is the first shared sheet piece
// in the app; until now every sheet was an inline scrim > container pair with
// the dialog attributes typed out on each (c0ab68b). This is deliberately a
// thin container, not a whole <BottomSheet> with scrim and handle: the sheets
// differ in their chrome, and the scrim's own onClick (backdrop tap) stays on
// the call site exactly as it was. The panel stops click propagation, so a tap
// inside never reaches the scrim.
//
// Why a component and not just the hook at the call site: useSheetDrag keeps
// the drag offset and the "leaving" slide as state, and that state has to die
// with the sheet. Calling the hook in ProvisionsApp (always mounted) would
// leave the sheet translated off-screen on its NEXT open; a container that
// mounts with the sheet resets it for free.
//
// Capped to the screen (2026-10-05, the Profile sheet at XXL on a 320px
// screen ran 546px tall and clipped off the top — handle, name and Close
// gone, nothing to scroll them back): max-height leaves 24px of scrim above
// the sheet plus the notch (dvh, so Safari's toolbars count), the panel
// scrolls inside itself, and overscroll never chains to the page. A sheet
// taller than the screen opens at scrollTop 0. The drag hook arms only at the
// top and flips touch-action so the scroll is native once scrolled.
//
// Usage — the Profile sheet today; the Shop Add sheet can move over the same
// way (className="add-sheet", the scrim untouched):
//   <SheetPanel onClose={close} label="Account and preferences" style={…}>
//     <SheetClose onClose={close} />
//     …
//   </SheetPanel>
const CAP = {
  maxHeight: "calc(100dvh - 24px - env(safe-area-inset-top))",
  overflowY: "auto",
  overscrollBehavior: "contain",
};

export function SheetPanel({ onClose, label, className, style, children }) {
  const drag = useSheetDrag(onClose);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={className}
      style={{ ...CAP, ...style, ...drag.style }}
      onClick={(e) => e.stopPropagation()}
      {...drag.handlers}
    >
      {children}
    </div>
  );
}

export default SheetPanel;
