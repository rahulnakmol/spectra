const GRAPH_METADATA = 'https://graph.microsoft.com/v1.0/$metadata';

export function makeGraphProbe(timeoutMs = 3_000): () => Promise<void> {
  return async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs).unref();
    try {
      const resp = await fetch(GRAPH_METADATA, { method: 'GET', signal: ctrl.signal });
      // $metadata is anonymous-readable; any 5xx is a real outage.
      if (resp.status >= 500) throw new Error(`Graph metadata returned ${resp.status}`);
    } finally {
      clearTimeout(t);
    }
  };
}
