import appInsights from 'applicationinsights';

let initialized = false;

export function initAppInsights(connectionString: string): void {
  if (initialized) return;
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
}

export function getAppInsightsClient(): appInsights.TelemetryClient | undefined {
  return appInsights.defaultClient;
}
