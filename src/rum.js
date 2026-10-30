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
  '.hdr-action',     // THE header action pill: Shop "+ Add", This Week "+ Add", Meals "+ New" (src/components/HeaderAction.js)
  '.wrapbar',        // Shop Wrap Up bar above the Helm: "Leaving early? Wrap up →" / "N of M · K carry forward Wrap up" (counts only, never a name)
  '.all-done-btn',   // All done card's "Wrap up trip →"
  '.add-btn',        // row "Add" buttons (Browse, search, meal sheet)
  '.board-lock',     // Plan board "Add to Shop" (v2; the class keeps the hook's name)
  '.board-see',      // Plan board "See on list" / "Wrap up →" at 0 left (Amendment C) — fixed copy
  '.board-cook',     // Plan board "Cooked it"
  '.board-more',     // Plan board ⋯ menu trigger
  '.plan-addall',    // Plan header "+ Add N to Shop"
  '.plan-view',      // Plan title switch links: "This Week" / "Meals" (D1; fixed copy)
  '.plan-noshop',    // Hold a night: "Leftovers" / "Eating out" / "Something else" (board foot + welcome)
  '.lib-occ',        // Library occasion rail pills: All / Dinner / Breakfast / … (Meal Library v1)
  '.lib-fbtn',       // Library Filter button (icon only)
  '.lib-vtog',       // Library grid/list toggle (icon only; visual v2 D8)
  '.lib-settype',    // Untagged meal's invitation: "+ Set type" (grid) / "+ Set meal type" (list) — fixed copy; the meal name is in its aria-label only (Amendment A4)
  '.lib-type-chip',  // "Set meal type" picker chips: the seven occasion words (Amendment A5)
  '.lib-type-save',  // "Set meal type" picker: Save
  '.lib-type-cancel',// "Set meal type" picker: Cancel
  '.lib-plan',       // Library card pill: "Plan" / "This week" — fixed copy (a tap on "This week" un-plans); the meal name is in the SIBLING card-body button, never here
  '.lib-create',     // Library coaching tile "+ New meal" (the switch row's "+ New" is .hdr-action)
  '.lib-show',       // Library filter sheet: "Show N meals"
  '.lib-clear',      // Library filter sheet: "Clear"
  '.rv-edit',        // Recipe view: "Edit" — fixed copy; the title it edits is a sibling (#rv-title, masked), never in this element (SPEC_recipe_view)
  '.rv-plan',        // Recipe view main action: "+ Add to This Week" / "+ Plan again" / "Add to Shop" / "Wrap up →" / "Cooked it" — fixed copy, the board's own words. The count-bearing "{n} left to buy · See list" is .rv-see, OFF this list (SPEC_recipe_view Amendment B, R4)
  '.rv-remove',      // Recipe view quiet link: "Remove from This Week" / "Remove (and take its items off Shop)" — fixed copy, the board's ⋯ → Remove words
  '.rv-showall',     // Recipe view, Your cooks: "Show all N" — a count, never a name
  '.rv-photo-add',   // Recipe view photo strip: "Add a meal photo" / "Adding…" — fixed copy (SPEC_meal_photos_v1 R5/R6). The photos, the strip, its dots and caption are NOT here; every photo <img> is .op-replay-block
  '.rv-photo-replace', // Photo menu (hero + viewer ⋯): "Replace photo" — fixed copy (SPEC_photo_menu, 2026-10-25). The ⋯ trigger (.rv-photo-more) is off this list, named by aria-label "Photo options"
  '.rv-photo-details', // Photo menu: "Photo details" — fixed copy; it opens the details sheet, whose lines (who, when) are masked text, off this list
  '.rv-photo-save',  // Photo menu: "Save to Photos" / "Download photo" — fixed copy
  '.rv-photo-remove',// Photo menu: "Remove photo" — fixed copy (R5); it opens the confirm sheet and removes nothing
  '.rv-photo-confirm-remove', // Remove confirm sheet: "Remove photo" — fixed copy; THE removal. The title "Remove this photo?" and the body are masked text, off this list; the thumbnail is .op-replay-block
  '.rv-photo-confirm-keep',   // Remove confirm sheet: "Keep photo" — fixed copy
  '.rv-photo-placeholder',    // Recipe view hero after the last photo is removed: "Add a meal photo" / "Show the household how it turned out." — fixed copy
  '.rv-photo-make-showcase', // Photo menu, the author's own cook photo: "Make showcase" — fixed copy (SPEC_meal_sharing_v2 S46, 2026-10-30; 073). Opens the S13 prompt, whose lines are masked text
  '.rv-photo-make-cook',     // Photo menu, the author's own showcase photo: "Make it a meal photo" — fixed copy
  '.rv-showcase-go',         // S13 prompt: "Make showcase" — fixed copy; THE flip
  '.rv-showcase-cancel',     // S13 prompt: "Not now" — fixed copy
  '.rv-photo-full-ok',       // "Meal photos are full" sheet: "OK" — fixed copy; the sheet's two lines are masked text
  '.rv-more',          // Recipe view header: the meal's ⋯, aria-label "Meal options" — fixed copy (SPEC_meal_sharing_phase_a_client Commit 2; Dan 2026-10-29). Beside Edit; the title it acts on is #rv-title, masked, never in this element
  '.rv-give',          // Meal ⋯: "Give this meal" — fixed copy
  '.rv-stop-giving',   // Meal ⋯: "Stop giving" — fixed copy; shown only while the meal has an unrevoked gift
  '.give-go',          // Give sheet (B1/B2): "Give" / "Getting it ready…" — fixed copy; the meal name and the note are masked text / a masked input beside it
  '.give-nudge',       // Give sheet B2: "Make one of your photos a showcase →" — fixed copy; opens the recipe view's strip
  '.give-send',        // Give sheet B4/B5: "Send it" — fixed copy; THE share (navigator.share from this tap, C3)
  '.give-copy',        // Give sheet B4/B5: "Copy link" — fixed copy; the link itself is never rendered
  '.stop-giving-yes',  // Stop giving confirm: "Stop giving" — fixed copy; THE revoke
  '.stop-giving-no',   // Stop giving confirm: "Keep giving" — fixed copy
  '.rv-photo-open',  // Recipe view photo hero: the photo itself as a button, aria-label "View photo full size" — no text content (the <img> inside is .op-replay-block, alt "") (Dan, 2026-10-21)
  '.rv-viewer-close',// Full-size photo viewer: "×", aria-label "Close photo" — fixed copy. The "N of M" count and the caption are household text, OFF this list
  '.rv-photo-prev',  // Photo strip + viewer, desktop only: "‹", aria-label "Previous photo" — fixed copy, no text content (Dan, 2026-10-21)
  '.rv-photo-next',  // Photo strip + viewer, desktop only: "›", aria-label "Next photo" — fixed copy, no text content
  '.rv-dot',         // Photo strip + viewer dots (buttons; clickable on desktop): no text content, aria-label "Show photo N" — a position, never content
  '.board-photo-add',// Board afterglow (Photos slice 2, S4): "Add a meal photo" / "Adding…" — fixed copy (R6)
  '.rate-star',      // Cook rating stars (afterglow "How was it?" + "Your cooks"): no text content, aria-label "Rate N of 3" — fixed copy; the note input and the label are OFF this list
  '.deck-primary',   // Home on-deck card: "Add to Shop" / "Cooked it" / "✓ Cooked" / "Add a meal" (SPEC_home_v1_essentials)
  '.deck-switch',    // Home on-deck card: "Switch"
  '.deck-x',         // Home on-deck card: × on a held night
  '.home-line-link', // Home list line: "Let's shop →" / "Start a list →"
  '.trip-reality-real',    // trip summary ask: "Real trip"     (SPEC_trip_qualification_v2 — these three ARE the D11 ask-rate metric)
  '.trip-reality-testing', // trip summary ask: "Just testing"
  '.trip-reality-countit', // trip summary excluded line: "Count it"
  '.op-galley-photo', // New Meal Ask the Galley card: the camera (icon only, aria-label "Add a photo" — its text content is empty, like .op-galley-x; the textarea is never in this element)
  '.op-galley-clear', // Ask the Galley, photo state: "Clear"
  '.op-galley-x',     // Ask the Galley: × on a staged screenshot thumbnail (aria-label "Remove screenshot N")
  '.op-galley-add',   // Ask the Galley: the dashed + tile ("Add another screenshot")
  '.op-galley-chip',  // Ask the Galley starter chips on the empty card: "Something cozy with chicken" / "Quick weeknight dinner" / "Read a recipe card" (fixed copy)
  '.op-galley-switch', // Ask the Galley, under a paste: "Want ideas instead?" (the one-tap override; fixed copy)
  '.op-galley-go',    // Ask the Galley primary: "Create a meal" / "Read these" / "Read this recipe" — the mode label, fixed copy; its data-galley-mode carries the enum (invent / read_photos / read_paste), never text
  '.op-galley-about', // Ask the Galley: "About the Galley" — the one honest touchpoint (fixed copy); the sentence it opens is a sibling, never in this element
  '.op-start-over',  // New Meal import banner: "Start over" — the banner's text and the From field beside it are never in this element
  '.gift-add',       // Signed-out gift card (/g/{CODE}, SPEC_meal_sharing_phase_a_client C5): "Add to our meals" — fixed copy; the title, From and count are masked text in sibling elements, never here
  '.gift-signin',    // Gift card: "Sign in" — fixed copy
  '.gift-what',      // Gift card A3 (unknown or revoked): "What is OurProvisions?" — fixed copy, a link to the landing page
  '.gift-retry',     // Gift card, request failed: "Try again" — fixed copy
  '.op-chrome',      // chrome with no other stable class (the error toast's Dismiss)
];

// The Clerk auth UI (login, password, MFA/OTP) is excluded UNCONDITIONALLY in
// BOTH environments and in BOTH the recorder and click-text collection — that is
// a floor, not an environment-dependent choice. Listed last: later rules win.
const CLERK_EXCLUDE_RULES = [
  { rule: 'exclude', selector: '[class*="cl-"]' },
  { rule: 'exclude', selector: '#clerk-components' },
];

// Photo surfaces are excluded from session replay UNCONDITIONALLY, in BOTH
// environments (SPEC_replay_labels_promotion2 A5, 2026-10-19) — the same floor
// as Clerk, not an environment-dependent choice. A photo element's URL is a
// household photo: the header's is a Supabase signed URL (valid an hour), the
// avatar's a stable link to the user's own picture. The recorder copies src and
// style attributes verbatim and hands http(s) image URLs to Splunk to proxy; a
// blob: image (a staged Galley screenshot, the photo editor's local preview) it
// cannot proxy, so it DOWNLOADS it in the page and uploads the bytes. An
// excluded element is serialized as its size alone ({ height, width,
// isExcluded }) — no attributes, no assets — and replays as an empty box.
// Every photo element carries .op-replay-block. Recorder only: a photo has no
// click text.
const REPLAY_BLOCK_RULES = [
  { rule: 'exclude', selector: '.op-replay-block' },
];

// D5 (SPEC_auth_state_ui_gating §PII scrub 2) — the exporter hook. Every span
// the agent sends carries location.href; documentLoad and resource spans carry
// http.url and document.referrer. A pre-fill arrival put the visitor's email in
// that URL (prod, 2026-09-24: Splunk stored it in the clear). App.js strips the
// params from the URL itself right after reading them; this hook is the second
// wall — any URL attribute on OUR origin loses its query string before it is
// serialized. The hash stays (it is the route). Covers: location.href,
// http.url, document.referrer and any attribute whose key ends in ".url". Does
// NOT cover session replay's own URL capture — the recorder is a separate
// pipeline with no attribute hook; the replaceState in App.js is what protects
// replay, which is why it runs before the first routeChange.
//
// A URL's query is a secret until proven a filter (SPEC_rum_span_url_scrub,
// 2026-10-21). Until then other origins were untouched on purpose — a Supabase
// REST query is the filter — but a signed storage URL's query is a live token
// (valid an hour) and its path names a household's photo: 24 resource spans and
// 14 fetch spans carried them to Splunk on dev, and the Home banner on prod.
// So, on every origin: the query goes (D1), except Supabase REST /rest/v1/ on
// the dev and prod project hosts, where it is the PostgREST filter; another
// origin's fragment goes too (D2); a storage path stops at the bucket (D3);
// a Clerk image is its origin alone (D4); a value new URL() cannot parse is cut
// at its "?" (D6).
const URL_ATTRIBUTE_KEYS = new Set(['location.href', 'http.url', 'document.referrer']);
const SUPABASE_HOSTS = new Set(['zxwtxjjmssykhqrghouf.supabase.co', 'parpauldmbetptkmdwbd.supabase.co']); // dev, prod
const CLERK_IMAGE_HOSTS = new Set(['img.clerk.com']);
// Clerk's Frontend API (SPEC_rum_clerk_id_scrub D1–D4; Amendment 2026-10-26 R5).
// Its token refresh (~60 s) and sign-in calls put ids in the PATH —
// /v1/client/sessions/sess_…/tokens — and the 10-23 prod HAR found 10 spans
// carrying one. A session id can't authenticate anyone, but it ties every
// span of one login together, the linkage [clerk] removes for user ids.
// Matched by HOSTNAME (prod: the custom domain; dev: Clerk's shared
// *.clerk.accounts.dev), never by substring, so a Supabase or app URL that
// happens to contain "sess_" is never altered. img.clerk.com keeps its own
// rule above. On a Clerk host: every path segment shaped like a Clerk id —
// a short lowercase prefix, "_", a long random tail — becomes <prefix>_[id],
// by PATTERN, so an unseen Clerk route cannot leak (sess_, sia_, sua_, user_,
// client_, ins_ are test cases, not the rule); the prefix stays so the route
// shape still reads. The prefix allows 2–6 letters because client_ has six
// (R5 ruling, 2026-10-26); the tail needs 16+ characters — Clerk ids carry 27 —
// so route words shaped like an id (oauth_callback, email_addresses,
// saml_accounts) keep reading as routes. The query is dropped whole (D3): it
// carries nothing worth keeping (_clerk_js_version, _method) and dev's
// __clerk_db_jwt is a token.
const CLERK_API_HOST = 'clerk.ourprovisions.velayo.ai';
const CLERK_API_DEV_SUFFIX = '.clerk.accounts.dev';
const isClerkApiHost = (hostname) => hostname === CLERK_API_HOST || hostname.endsWith(CLERK_API_DEV_SUFFIX);
const CLERK_ID_SEGMENT = /^[a-z]{2,6}_[A-Za-z0-9]{16,}$/;
const maskClerkIds = (pathname) =>
  pathname.split('/').map((s) => (CLERK_ID_SEGMENT.test(s) ? `${s.slice(0, s.indexOf('_') + 1)}[id]` : s)).join('/');
// A gift code is a bearer key (SPEC_meal_sharing_v2 S22 / S29 / S33; R4): on
// OUR origin, /g/<code> → /g/[code]. Load-bearing, not a backup — the
// documentLoad span reads the original URL from PerformanceNavigationTiming,
// which src/lib/preRum.js's replaceState cannot reach; this hook can. Built
// before any /g/ route exists so Phase A inherits it.
const GIFT_PATH = /^\/g\/[^/]+/;
// D3 widened (design chat, 2026-10-22): the cut fires on ANY /storage/v1/
// route. A recognised route keeps its operation and bucket; otherwise the cut
// lands after the first segment past the route (an unknown route counts its
// own first segment as the route). It fails closed: an unrecognised shape loses
// its bucket name, never leaks its object path.
const STORAGE_ROOT = '/storage/v1/';
const STORAGE_ROUTES = [['render', 'image'], ['object']];
// The operation segments that come before the bucket, longest first. An upload
// (POST /object/<bucket>/<path>) has none: the cut still lands after the bucket.
const STORAGE_OPERATIONS = [
  ['upload', 'sign'], ['info', 'public'], ['info', 'authenticated'],
  ['sign'], ['public'], ['authenticated'], ['info'], ['list'],
];
// A kept REST query still loses a clerk_id filter's value (design chat,
// 2026-10-22): the Clerk user id is an account identifier, and D2 sends spans
// without one. The operator stays (users?clerk_id=eq.[clerk]); every other byte
// of the query is untouched, so this edits the string, not URLSearchParams.
const maskClerkFilters = (search) =>
  search.replace(/([?&](?:[^=&]*\.)?clerk_id=)((?:not\.)?[a-z]+\.)?[^&]*/g, '$1$2[clerk]');
const startsWithSegs = (segs, prefix) => prefix.every((s, i) => segs[i] === s);
function cutStoragePath(pathname) {
  const at = pathname.indexOf(STORAGE_ROOT);
  if (at === -1) return pathname;
  const head = pathname.slice(0, at + STORAGE_ROOT.length);
  const segs = pathname.slice(head.length).split('/');
  const route = STORAGE_ROUTES.find((r) => startsWithSegs(segs, r));
  const routeLen = route ? route.length : 1;
  const op = (route && STORAGE_OPERATIONS.find((o) => startsWithSegs(segs.slice(routeLen), o))) || [];
  const keepLen = routeLen + op.length + 1; // route + operation + bucket (or first segment)
  const kept = segs.slice(0, keepLen);
  const rest = segs.slice(keepLen).filter(Boolean);
  return head + kept.join('/') + (rest.length ? '/[object]' : '');
}
function scrubUrl(value) {
  if (typeof value !== 'string') return value;
  let u;
  try {
    u = new URL(value, window.location.href);
  } catch (e) {
    const q = value.indexOf('?');
    return q === -1 ? value : value.slice(0, q);
  }
  const isHttp = u.protocol === 'https:' || u.protocol === 'http:';
  const isOwnOrigin = u.origin === window.location.origin;
  let path = u.pathname;
  if (isHttp) {
    if (CLERK_IMAGE_HOSTS.has(u.hostname)) path = '/[object]';           // D4 (span scrub)
    else if (isClerkApiHost(u.hostname)) path = maskClerkIds(path);      // D1–D2 (Clerk-id scrub)
    else if (isOwnOrigin) path = path.replace(GIFT_PATH, '/g/[code]');   // R4
    else path = cutStoragePath(path);                                     // D3 (span scrub)
  }
  // The query survives only as a Supabase REST filter. On a Clerk API host it is
  // dropped whole (Clerk-id scrub D3) — the same fall-through as any other origin,
  // stated here because it is a guarantee with its own test, not an accident.
  const isRest = SUPABASE_HOSTS.has(u.hostname) && u.pathname.startsWith('/rest/v1/');
  const search = isRest ? maskClerkFilters(u.search) : '';
  const hash = isOwnOrigin ? u.hash : '';
  if (path === u.pathname && search === u.search && hash === u.hash) return value;
  if (!isHttp) {
    u.search = '';
    u.hash = '';
    return u.toString();
  }
  // Built by hand so "[object]" stays literal.
  return `${u.protocol}//${u.host}${path}${search}${hash}`;
}
export function scrubUrlAttributes(attributes) {
  let out = attributes;
  for (const key in attributes) {
    if (!URL_ATTRIBUTE_KEYS.has(key) && !key.endsWith('.url')) continue;
    const scrubbed = scrubUrl(attributes[key]);
    if (scrubbed === attributes[key]) continue;
    if (out === attributes) out = { ...attributes };
    out[key] = scrubbed;
  }
  return out;
}

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
    // D5: see scrubUrlAttributes above. Never throws into the agent.
    exporter: {
      onAttributesSerializing: (attributes) => {
        try { return scrubUrlAttributes(attributes); } catch (e) { return attributes; }
      },
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
      ...REPLAY_BLOCK_RULES,
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
