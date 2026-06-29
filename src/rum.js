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

  // Session replay masking. Order matters: general first, specific last;
  // exclude is absolute. Defense-in-depth: unmask the grocery UI for useful
  // replays, but mask ALL inputs globally and exclude the Clerk auth modal.
  SplunkSessionRecorder.init({
    realm: 'us1',
    rumAccessToken: rumToken,
    sensitivityRules: [
      { type: 'unmask', selector: 'body' },
      { type: 'mask', selector: 'input' },
      { type: 'mask', selector: 'textarea' },
      { type: 'exclude', selector: '[class*="cl-"]' },
      { type: 'exclude', selector: '#clerk-components' },
    ],
  });
} else {
  console.warn('Splunk RUM: no token found, skipping instrumentation');
}
