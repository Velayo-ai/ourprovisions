import SplunkOtelWeb from '@splunk/otel-web';
import SplunkSessionRecorder from '@splunk/otel-web-session-recorder';

const rumToken = process.env.REACT_APP_RUM_TOKEN;

// Skip init if no token (prevents boot errors in local dev without env set)
if (rumToken) {
  SplunkOtelWeb.init({
    realm: 'us1',
    rumAccessToken: rumToken,
    applicationName: 'OurProvisions',
    deploymentEnvironment: process.env.NODE_ENV, // 'production' / 'development'
    version: '1.0.0',
  });

  SplunkSessionRecorder.init({
    realm: 'us1',
    rumAccessToken: rumToken,
  });
} else {
  console.warn('Splunk RUM: no token found, skipping instrumentation');
}
