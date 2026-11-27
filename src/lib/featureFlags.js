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

// ONE_ADD_ENABLED (2026-11-27, SPEC_results_feeder_standard: an experiment, not a ruling). Plan and
// List start at results and feed through one + Add; Browse moves inside Add. ON only when
// REACT_APP_FEATURE_ONE_ADD is exactly "on", and Vercel sets it ONLY as a Preview variable scoped
// to the exp/one-add branch: never Production, never the dev branch. Off, the app is today's app.
export const ONE_ADD_ENABLED = askFlagOn(process.env.REACT_APP_FEATURE_ONE_ADD);

// Same marker rule as Ask: "op-one-add:on" can appear only in a bundle built with the variable set,
// so a dev or prod bundle must NOT contain it; an exp/one-add preview bundle must.
export const ONE_ADD_FLAG_MARKER = "op-one-add:" + (process.env.REACT_APP_FEATURE_ONE_ADD || "off");
