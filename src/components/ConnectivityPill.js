import { useConnectivity } from "../contexts/ConnectivityContext";
import { useAuthHealth } from "../lib/authHealth";
import { resolvePillState } from "../lib/pillState";

const CONFIGS = {
  reconnecting: {
    background: "#EFE2CC",
    color: "#6B4E1F",
    border: "1px solid #E8D4A8",
    dotColor: "#B8860B",
    dotStyle: "pulse",
    label: "Reconnecting…",
  },
  offline: {
    background: "#F0E0BE",
    color: "#6B4E1F",
    border: "1px solid #B8860B",
    dotColor: "#6B4E1F",
    dotStyle: "steady",
    label: "Offline — showing last saved",
  },
  recovered: {
    background: "#CDEDE8",
    color: "#0A5A52",
    border: "1px solid #0D9488",
    dotColor: "#0D9488",
    dotStyle: "steady",
    label: "Back online",
  },
};

// NOT self-anchored. The pill is one item in the bottom status stack owned by
// App.js — see "bottom status stack" there. It used to be `position: fixed;
// bottom: 28px; left: 50%`, which collided with two toasts anchored to the same
// spot: the success toast matched it exactly (28px, z-index 2000) and the error
// toast sat 4px away. Three elements, three independent anchors, no awareness of
// each other. Position belongs to the stack now; this object keeps only how the
// pill LOOKS. Re-adding a `position` here re-creates the collision.
const pillStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "7px 14px",
  borderRadius: "999px",
  fontFamily: "'Lato', sans-serif",
  fontSize: "13px",
  fontWeight: 500,
  whiteSpace: "nowrap",
  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
  pointerEvents: "none",
};

const dotBase = {
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  flexShrink: 0,
};

// `hasSavedData` (A5b, Addendum 2026-09-27): true once this household's data has
// rendered at least once — App.js passes householdReady. Without it the
// "offline" state is drawn as "Reconnecting…": there is nothing saved to show.
// Copy only — visibility still follows connState alone.
//
// `queuedCount` (offline check-off R4, 2026-11-23): checks saved on this phone and not yet synced. While
// there are any, the pill says so whatever the connection state: offline → "Offline · N checks waiting to
// sync"; online (they're on their way) → "Syncing N checks…". It takes over from "Reconnecting…".
export function ConnectivityPill({ hasSavedData = true, queuedCount = 0, syncing = false }) {
  const { connState } = useConnectivity();
  const { online } = useAuthHealth();

  if (queuedCount > 0) {
    const noun = queuedCount === 1 ? "check" : "checks";
    // The dot pulses while a send is actually in flight.
    return renderPill(online
      ? { ...CONFIGS.reconnecting, dotStyle: syncing ? "pulse" : "steady", label: `Syncing ${queuedCount} ${noun}…` }
      : { ...CONFIGS.offline, label: `Offline · ${queuedCount} ${noun} waiting to sync` });
  }

  if (connState === "online") return null;

  return renderPill(CONFIGS[resolvePillState(connState, hasSavedData)]);
}

function renderPill(cfg) {

  return (
    <>
      <style>{`
        @keyframes connectivity-pulse {
          0%   { opacity: 1;    transform: scale(1);   }
          50%  { opacity: 0.35; transform: scale(0.8); }
          100% { opacity: 1;    transform: scale(1);   }
        }
      `}</style>
      <div
        role="status"
        aria-live="polite"
        style={{
          ...pillStyle,
          background: cfg.background,
          color: cfg.color,
          border: cfg.border,
        }}
      >
        <span
          style={{
            ...dotBase,
            background: cfg.dotColor,
            animation:
              cfg.dotStyle === "pulse"
                ? "connectivity-pulse 1.3s ease-in-out infinite"
                : "none",
          }}
        />
        {cfg.label}
      </div>
    </>
  );
}

export default ConnectivityPill;
