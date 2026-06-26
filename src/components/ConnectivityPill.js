import { useConnectivity } from "../contexts/ConnectivityContext";

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

const pillStyle = {
  position: "fixed",
  bottom: "28px",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 2000,
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

export function ConnectivityPill() {
  const { connState } = useConnectivity();

  if (connState === "online") return null;

  const cfg = CONFIGS[connState];

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
