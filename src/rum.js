import SplunkOtelWeb from '@splunk/otel-web';
import SplunkSessionRecorder from '@splunk/otel-web-session-recorder';

const rumToken = process.env.REACT_APP_RUM_TOKEN;
const deployEnv = process.env.REACT_APP_DEPLOY_ENV || 'local';

// Set once init() has run; setHousehold() below is a no-op until then.
let rumReady = false;

// DXA prod allow-list (SPEC_rum_dxa_exposure.md, D4). On prod every text node is
// masked for click-text collection and ONLY these selectors are unmasked: app
// chrome that can never carry household data. Item names, meal names, the
// household name and every <input> stay masked. Never `body`, never a bare tag.
// Any future chrome that renders household text (a household-name pill in the
// helm, say) must NOT match one of these — see the drift note in src/nav.js.
// Rules are matched against the CLICKED element and its ANCESTORS (the agent
// walks up from the event target), never its children — so the selector must
// name the element the tap lands on, or something above it. `.helm-door` is
// the door button (its text is the label plus, on Shop, the badge count);
// `.helm-label` still matters when the tap lands on the label span itself.
const CHROME_ALLOW_LIST = [
  '.helm-door',      // Helm + Rail door buttons: Home / Plan / Browse / Shop (+ badge count)
  '.helm-label',     // the label span inside a door, when it is the tap target
  '.helm-plus',      // the compact pill's +
  '.shop-seg',       // Shop lens toggle: Aisles | A–Z
  '.hdr-plus',       // Shop header +
  '.wrapup',         // Shop header "Wrap up"
  '.all-done-btn',   // All done card's "Wrap up trip →"
  '.add-btn',        // row "Add" buttons (Browse, search, meal sheet)
  '.board-lock',     // Plan board "Add to Shop" (v2; the class keeps the hook's name)
  '.board-see',      // Plan board "See on list"
  '.board-cook',     // Plan board "Cooked it"
  '.board-more',     // Plan board ⋯ menu trigger
  '.plan-addall',    // Plan header "+ Add N to Shop"
  '.plan-meals',     // Plan header "+ Add a meal" → library
  '.plan-noshop',    // Hold a night: "Leftovers" / "Eating out" / "Something else" (board foot + welcome)
  '.lib-filter',     // Library filter pills
  '.lib-plan',       // Library round + (Plan)
  '.tonight-link',   // Home Tonight card: "+ Add tonight's meal" / "View meal →" / "View plan →"
  '.list-card-link', // Home list card: "Start a list →" / "View list →"
  '.op-chrome',      // chrome with no other stable class (the error toast's Dismiss)
];

// The Clerk auth UI (login, password, MFA/OTP) is excluded UNCONDITIONALLY in
// BOTH environments and in BOTH the recorder and click-text collection — that is
// a floor, not an environment-dependent choice. Listed last: later rules win.
const CLERK_EXCLUDE_RULES = [
  { rule: 'exclude', selector: '[class*="cl-"]' },
  { rule: 'exclude', selector: '#clerk-components' },
];

// Skip init if no token (prevents boot errors in local dev without env set)
if (rumToken) {
  // Session replay masking is SPLIT BY ENVIRONMENT — this conditional is
  // deliberate; do not "clean up" isProd back to one global setting.
  // See SPEC_rum_session_replay_masking.md under docs/specs/.
  //   dev  -> inputs/text UNMASKED: full debugging value, audience is Dan and
  //           dev-preview testers who know this is actively instrumented.
  //   prod -> inputs/text MASKED: real beta household/friends-and-family users
  //           who have not been told replay may capture literal keystrokes.
  // The same split drives the DXA click-text `privacy` block below, with a
  // tighter prod rule (allow-list, never `body`).
  // Order matters: general first, specific last; exclude is absolute.
  const isProd = deployEnv === 'production'; // exact Vercel prod value, confirmed 2026-09-03

  SplunkOtelWeb.init({
    realm: 'us1',
    rumAccessToken: rumToken,
    applicationName: 'OurProvisions',
    deploymentEnvironment: deployEnv,
    version: '1.0.0',
    // D2: anonymous tracking, STATED — not inherited from a default that could
    // flip again (v2.0 flipped it once). A persistent anonymous id gives DXA
    // cross-session journeys without a Clerk id or email leaving the app.
    user: { trackingMode: 'anonymousTracking' },
    // D2: pinned to the hostname so dev and prod ids stay separate — a shared
    // velayo.ai cookie would merge dev sessions into prod journeys.
    cookieDomain: window.location.hostname,
    // D4: click-text privacy. Dev unmasked (same audience argument as replay);
    // prod masked with the chrome allow-list so the funnel reads "Wrap up",
    // not "<button>". Clerk excluded in both.
    privacy: {
      maskAllText: isProd,
      sensitivityRules: [
        ...(isProd ? CHROME_ALLOW_LIST.map((selector) => ({ rule: 'unmask', selector })) : []),
        ...CLERK_EXCLUDE_RULES,
      ],
    },
    // D6: frustration signals in both envs. Dead click + error click are opt-in
    // (rage click is on by default and stays on). The 09-14 "Could not wrap up"
    // toast would have surfaced as an error click before a guest found it.
    instrumentations: {
      frustrationSignals: { deadClick: true, errorClick: true },
    },
  });
  rumReady = true;

  SplunkSessionRecorder.init({
    realm: 'us1',
    rumAccessToken: rumToken,
    maskAllInputs: isProd,
    maskAllText: isProd,
    sensitivityRules: [
      // An unmask rule BEATS maskAllInputs/maskAllText, so on prod it must not
      // be in the array at all — not merely set to something weaker.
      ...(isProd ? [] : [{ rule: 'unmask', selector: 'body' }]),
      ...CLERK_EXCLUDE_RULES,
    ],
  });
} else {
  console.warn('Splunk RUM: no token found, skipping instrumentation');
}

// D5: household as a segment dimension. Stamps `household.id` (a uuid — never
// the name, never a user id or email) on every subsequent span. Called from
// ActiveHouseholdContext whenever the active household resolves or changes;
// null (membership lost, signed out) stops the stamp. setGlobalAttributes
// MERGES, and the OTel span attribute setter skips undefined values, so an
// undefined value retires the key without touching the agent's own attributes.
// No-op when RUM did not init (no token) — never throws into the app.
//
// 053 / SPEC_learning_qualification.md D8: global learning exclusion rides the
// same call. `exclusion` is { household: boolean|undefined, user: boolean|undefined }
// read from households.excluded_from_learning and users.excluded_from_learning
// (the caller's own row). A guest demo is a complete plan → shop → wrap-up
// journey nobody lived; it pollutes the DXA funnel exactly as it pollutes the
// list, and Dan's demos happen inside his REAL households, so the user flag
// is carried too. Omitted / undefined → the attribute is retired, never
// asserted false: unknown is not "not excluded".
export function setHousehold(id, exclusion) {
  if (!rumReady) return;
  try {
    SplunkOtelWeb.setGlobalAttributes({
      'household.id': id || undefined,
      'household.excluded_from_learning': exclusion ? exclusion.household : undefined,
      'user.excluded_from_learning': exclusion ? exclusion.user : undefined,
    });
  } catch (e) {
    // Telemetry never reaches the user.
  }
}
