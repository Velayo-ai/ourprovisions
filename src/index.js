import './lib/preRum';
import './rum';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { ClerkProvider } from '@clerk/clerk-react';

// ?invite= / ?ref= (and a /g/<code> path) are held in sessionStorage and cleared
// from the URL by src/lib/preRum.js — the FIRST import above, so it runs before
// src/rum.js starts Splunk (S29 / S33; Amendment 2026-10-26 R1–R3). The bridge
// used to be inline here, which ran AFTER every hoisted import, i.e. after both
// Splunk inits had already seen the raw URL. Keep the import order; a test checks it.

// Env-driven so the build env selects the Clerk instance:
//   Production → pk_live_… (prod Clerk)   Preview/Development → pk_test_… (dev Clerk)
// (was a hardcoded pk_test_ literal, which baked dev keys into every bundle.)
const clerkPublishableKey = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

// ── Clerk router functions (SPEC_auth_state_ui_gating, activation root cause,
// 2026-09-24) ──────────────────────────────────────────────────────────────────
// With no routerPush/routerReplace, clerk-js navigates via windowNavigate, which
// dispatches "clerk:beforeunload" and then assigns window.location.href. The
// modal's default redirect is the CURRENT URL (RedirectUrls: mode "modal" →
// window.location.href), and this app always has a hash in it — so that
// assignment is a fragment navigation: nothing unloads. But setActive wrapped
// the navigate in a beforeunload tracker that also listens for that custom
// event, and it returns BEFORE setAccessors/emit when the tracker fired
// (clerk-js 5.128: `…isUnloading())return;this.#X(c),this.#Q()`). Net effect,
// verified on the 2eafad0 preview: window.Clerk holds an active client session
// while the React tree is left with session/user undefined (useUser isLoaded
// false) — SIGN IN header over a signed-in shell with no name — until a reload.
//
// Providing router functions makes every same-origin navigation go through
// history instead: no custom event, the tracker stays quiet, setActive finishes
// and the emit reaches React. Cross-origin targets (Account Portal, OAuth) still
// get a real location change. A hash change is mirrored to the app's hashchange
// listener, which is how the app maps a hash to a door. clerk-js warns in
// development unless BOTH functions are supplied.
const clerkRouterNavigate = (replace) => (to) => {
  try {
    const url = new URL(to, window.location.href);
    if (url.origin !== window.location.origin) { window.location.href = url.href; return; }
    if (url.href === window.location.href) return;           // already here — no history churn
    const hashChanged = url.hash !== window.location.hash;
    const rel = url.pathname + url.search + url.hash;
    if (replace) window.history.replaceState(null, '', rel);
    else window.history.pushState(null, '', rel);
    if (hashChanged) window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (e) {
    window.location.href = to;                                // never strand a Clerk redirect
  }
};
const clerkRouterPush = clerkRouterNavigate(false);
const clerkRouterReplace = clerkRouterNavigate(true);

const root = ReactDOM.createRoot(document.getElementById('root'));

if (!clerkPublishableKey) {
  // Fail loud, not silent: mounting ClerkProvider with an undefined key yields a
  // blank white screen. Surface the misconfiguration so a bad build is unmissable.
  console.error(
    'REACT_APP_CLERK_PUBLISHABLE_KEY is not set for this build. ' +
    'Set it in the Vercel env for this scope (Production → pk_live_…, Preview/Development → pk_test_…).'
  );
  root.render(
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', color: '#2C1A0E' }}>
      <h1>Configuration error</h1>
      <p>Authentication isn’t configured for this build (missing Clerk key).</p>
    </div>
  );
} else {
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPublishableKey} routerPush={clerkRouterPush} routerReplace={clerkRouterReplace}>
        <App />
      </ClerkProvider>
    </React.StrictMode>
  );
  reportWebVitals();
}
