import './rum';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { ClerkProvider } from '@clerk/clerk-react';

// Capture invite code before Clerk's sign-up redirect can strip the URL param.
// Brand-new users are sent through Clerk auth, which drops ?invite=; persist it
// here (runs before ClerkProvider mounts) so bootstrap can recover it post-auth.
//
// ?ref= (spec D7) rides the identical bridge for the identical reason, but the two
// are DIFFERENT SPECIES and are deliberately not merged into one slot: invite grants
// membership and is single-use, ref grants nothing and only attributes. Losing a ref
// code costs attribution; losing an invite code costs access. Same mechanism, and the
// asymmetry in what failure means is why they stay separate keys.
try {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("invite");
  if (code) sessionStorage.setItem("pending_invite_code", code);
  const ref = params.get("ref");
  if (ref) sessionStorage.setItem("pending_ref_code", ref);
} catch (e) { /* sessionStorage unavailable — ignore */ }

// Env-driven so the build env selects the Clerk instance:
//   Production → pk_live_… (prod Clerk)   Preview/Development → pk_test_… (dev Clerk)
// (was a hardcoded pk_test_ literal, which baked dev keys into every bundle.)
const clerkPublishableKey = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

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
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <App />
      </ClerkProvider>
    </React.StrictMode>
  );
  reportWebVitals();
}
