import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { ClerkProvider } from '@clerk/clerk-react';

// Capture invite code before Clerk's sign-up redirect can strip the URL param.
// Brand-new users are sent through Clerk auth, which drops ?invite=; persist it
// here (runs before ClerkProvider mounts) so bootstrap can recover it post-auth.
try {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("invite");
  if (code) sessionStorage.setItem("pending_invite_code", code);
} catch (e) { /* sessionStorage unavailable — ignore */ }

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ClerkProvider publishableKey="pk_test_bWFueS1wdW1hLTM0LmNsZXJrLmFjY291bnRzLmRldiQ">
      <App />
    </ClerkProvider>
  </React.StrictMode>
);

reportWebVitals();
