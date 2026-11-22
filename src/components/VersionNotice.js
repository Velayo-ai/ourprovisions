// "A new version is ready." · Reload · ✕ (SPEC_app_version_check V2). The toast's own pill, but its own
// element: it has no timer, it carries two controls, and it must neither replace nor be replaced by a
// timed toast — App renders it in the bottom stack only when no Ask run is open and no toast is up.
// Reload is a plain location.reload() (no service worker); ✕ hides it for this foreground.
const PILL = {
  background: "rgba(44,26,14,0.92)", color: "#FAF4EC",
  fontFamily: "'Lato', sans-serif", fontSize: "0.85rem",
  padding: "6px 6px 6px 20px", borderRadius: "999px",
  boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
  maxWidth: "90vw", display: "flex", alignItems: "center", gap: "10px",
  animation: "fadeIn 0.18s ease",
  pointerEvents: "auto",   // like the toast with an action: the one bottom-stack child that takes taps
};
const RELOAD = {
  flex: "none", minHeight: "32px", background: "none", border: "1px solid rgba(250,244,236,0.4)", color: "#FAF4EC",
  borderRadius: "999px", padding: "5px 12px", cursor: "pointer",
  fontFamily: "'Lato', sans-serif", fontSize: "0.7rem", fontWeight: 900, letterSpacing: "1px", textTransform: "uppercase",
};
const CLOSE = {
  flex: "none", width: "32px", height: "32px", background: "none", border: "none", color: "#FAF4EC",
  borderRadius: "999px", cursor: "pointer", fontSize: "0.9rem", lineHeight: 1, display: "grid", placeItems: "center",
};

export function VersionNotice({ onReload, onDismiss }) {
  return (
    <div className="op-version-notice" role="status" style={PILL}>
      <span>A new version is ready.</span>
      <button type="button" onClick={onReload} style={RELOAD}>Reload</button>
      <button type="button" aria-label="Dismiss" onClick={onDismiss} style={CLOSE}>✕</button>
    </div>
  );
}

export default VersionNotice;
