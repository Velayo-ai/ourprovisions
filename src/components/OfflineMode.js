// Offline is a mode, not a problem (SPEC_offline_calm_2026-11-23): the header's small offline icon (C2),
// the short sheet it opens, and the one calm note per trip (C3). All neutral: no amber, no alarms, no
// counts on screen. Fixed copy only, so the RUM unmask rule never meets a name here.
import { NOTE_COPY, SHEET_COPY, changesLine, needsSignalLine } from "../lib/offlineMode";

// A cloud with a slash: the plain, widely-read sign for "no connection".
function CloudOff({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7.5 18.5h9.2a3.8 3.8 0 0 0 1.1-7.4 5.6 5.6 0 0 0-9.6-3" />
      <path d="M5.4 9.6A4.5 4.5 0 0 0 7.5 18.5" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

// C2: the indicator. Header gold at low contrast, the same family as the household name beside it.
export function OfflineIndicator({ onOpen }) {
  return (
    <button type="button" className="offline-indicator" onClick={onOpen} aria-label="Offline">
      <CloudOff />
    </button>
  );
}

// C2: tap → a short sheet. One plain line for changes waiting; one for the known gap (an add, a quantity,
// a removal or a price that needed signal), never an error toast.
export function OfflineSheet({ changes = 0, needsSignal = null, onClose }) {
  const waiting = changesLine(changes);
  const gap = needsSignalLine(needsSignal);
  return (
    <div className="modal-overlay offline-sheet-overlay" onClick={onClose}>
      <div className="modal offline-sheet" role="dialog" aria-label="Offline" onClick={(e) => e.stopPropagation()}>
        <div className="offline-sheet-head">
          <span className="offline-sheet-icon"><CloudOff size={20} /></span>
          <span className="offline-sheet-title">Offline</span>
        </div>
        <p className="offline-sheet-copy">{SHEET_COPY}</p>
        {waiting && <p className="offline-sheet-line">{waiting}</p>}
        {gap && <p className="offline-sheet-line">{gap}</p>}
        <div className="modal-actions-spaced" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="modal-confirm" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}

// C3: "Shopping offline · everything's saved", about 3 s, in the bottom status stack. Not a button.
export function OfflineNote() {
  return (
    <div className="offline-note" role="status" aria-live="polite">
      <CloudOff size={14} />
      <span>{NOTE_COPY}</span>
    </div>
  );
}
