// THE BUILD TAG, DEV ONLY (SPEC_app_version_check V3; spot approved in Step 0, 2026-11-22). "dev · <sha7>"
// in the 18px band under the Helm, low contrast, pointer-events none, z 901: above the page, below the
// sheets and the Ask run (2000), which cover it. It says which build a phone is running, so a walk can
// tell a stale bundle from a real failure.
// NEVER IN A PRODUCTION BUILD: BUILD_TAG_ON is the same build-time comparison as ASK_SEARCH_DEBUG (11-17).
// Vercel sets REACT_APP_DEPLOY_ENV = "production" for Production; CRA inlines it, the constant folds to
// false and `BUILD_TAG_ON && <BuildTag />` drops out of the bundle (read back on each promotion).
// The sha is REACT_APP_GIT_SHA, which .env.production maps from Vercel's VERCEL_GIT_COMMIT_SHA (rum.js
// uses the same); a local build has none and says "local".
export const BUILD_TAG_ON = process.env.REACT_APP_DEPLOY_ENV !== "production";

const STYLE = {
  position: "fixed", left: "28px", bottom: "calc(3px + var(--op-inset-bottom, 0px))",
  zIndex: 901, pointerEvents: "none", userSelect: "none",
  fontFamily: "'Lato', sans-serif", fontSize: "10px", lineHeight: "12px", letterSpacing: "0.3px",
  color: "rgba(44,26,14,0.4)",
};

export function BuildTag() {
  const sha = (process.env.REACT_APP_GIT_SHA || "").slice(0, 7) || "local";
  return <div className="op-build-tag" aria-hidden="true" style={STYLE}>dev · {sha}</div>;
}

export default BuildTag;
