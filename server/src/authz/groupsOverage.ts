import { UpstreamError } from '../errors/domain.js';

export async function fetchGroupsTransitive(accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  let url: string | null = 'https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.group?$select=id';
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) throw new UpstreamError('Graph groups overage request failed', { status: resp.status });
    const body = (await resp.json()) as { value?: Array<{ id: string }>; '@odata.nextLink'?: string };
    for (const g of body.value ?? []) ids.push(g.id);
    url = body['@odata.nextLink'] ?? null;
  }
  return ids;
}
