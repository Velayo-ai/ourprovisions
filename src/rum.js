import SplunkOtelWeb from '@splunk/otel-web';
import SplunkSessionRecorder from '@splunk/otel-web-session-recorder';

const rumToken = process.env.REACT_APP_RUM_TOKEN;
const deployEnv = process.env.REACT_APP_DEPLOY_ENV || 'local';

// Skip init if no token (prevents boot errors in local dev without env set)
if (rumToken) {
  SplunkOtelWeb.init({
    realm: 'us1',
    rumAccessToken: rumToken,
    applicationName: 'OurProvisions',
    deploymentEnvironment: deployEnv,
    version: '1.0.0',
  });

  // Session replay masking is SPLIT BY ENVIRONMENT — this conditional is
  // deliberate; do not "clean up" isProd back to one global setting.
  // See SPEC_rum_session_replay_masking.md under docs/specs/.
  //   dev  -> inputs/text UNMASKED: full debugging value, audience is Dan and
  //           dev-preview testers who know this is actively instrumented.
  //   prod -> inputs/text MASKED: real beta household/friends-and-family users
  //           who have not been told replay may capture literal keystrokes.
  // The Clerk auth UI (login, password, MFA/OTP) is excluded UNCONDITIONALLY in
  // BOTH environments — that is a floor, not an environment-dependent choice.
  // Order matters: general first, specific last; exclude is absolute.
  const isProd = deployEnv === 'production'; // exact Vercel prod value, confirmed 2026-09-03
  SplunkSessionRecorder.init({
    realm: 'us1',
    rumAccessToken: rumToken,
    maskAllInputs: isProd,
    maskAllText: isProd,
    sensitivityRules: [
      { rule: 'unmask', selector: 'body' },
      { rule: 'exclude', selector: '[class*="cl-"]' },
      { rule: 'exclude', selector: '#clerk-components' },
    ],
  });
} else {
  console.warn('Splunk RUM: no token found, skipping instrumentation');
}
