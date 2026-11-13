// Build-time feature flags (CRA inlines REACT_APP_* when the bundle is built).
//
// ASK_ENABLED (2026-11-12): Ask ships to dev only. Its schema (077 / 078 / 083 / 084) is not on
// prod, so with the flag off the app shows no trace of Ask and makes no request to an Ask table,
// RPC or the item-photos bucket. ON only when REACT_APP_FEATURE_ASK is exactly "on": Vercel sets it
// for Preview + Development; Production leaves it unset. Unset, empty or anything else is OFF, so a
// forgotten variable can never switch Ask on in production.
export const askFlagOn = (value) => value === "on";

export const ASK_ENABLED = askFlagOn(process.env.REACT_APP_FEATURE_ASK);

// The bundle marker, read back from a shipped bundle. Built from the value itself: when the variable
// is set, CRA inlines "on" and the minifier folds this to the literal "op-ask:on"; when it is unset
// CRA leaves a property read on its env object, nothing folds, and the literal "op-ask:on" cannot
// appear. So: a production bundle must NOT contain "op-ask:on"; a dev bundle must.
export const ASK_FLAG_MARKER = "op-ask:" + (process.env.REACT_APP_FEATURE_ASK || "off");
