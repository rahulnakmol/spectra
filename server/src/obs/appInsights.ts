import appInsights from 'applicationinsights';

let initialized = false;

export function initAppInsights(connectionString: string): void {
  if (initialized) return;
  try {
    appInsights
      .setup(connectionString)
      .setAutoDependencyCorrelation(true)
      .setAutoCollectRequests(true)
      .setAutoCollectPerformance(true, true)
      .setAutoCollectExceptions(true)
      .setSendLiveMetrics(false)
      .setUseDiskRetryCaching(true)
      .start();
    initialized = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('App Insights init failed (telemetry unavailable):', err instanceof Error ? err.message : String(err));
  }
}

export function getAppInsightsClient(): appInsights.TelemetryClient | undefined {
  return appInsights.defaultClient;
}
