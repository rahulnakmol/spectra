import type { TeamMembership } from '@spectra/shared';
import type { ConfigStore } from '../store/configStore.js';
import type { IdTokenClaims } from '../auth/msal.js';

export interface ResolveDeps {
  store: ConfigStore;
  fetchGroupsOverage: (accessToken: string) => Promise<string[]>;
}

export async function resolveRoleSnapshot(
  claims: IdTokenClaims,
  accessToken: string,
  deps: ResolveDeps,
): Promise<{ isAdmin: boolean; teamMemberships: TeamMembership[] }> {
  const isAdmin = Array.isArray(claims.roles) && claims.roles.includes('AppAdmin');
  const groupIds = await collectGroupIds(claims, accessToken, deps.fetchGroupsOverage);
  const map = await deps.store.getGroupRoleMap();
  const teamMemberships: TeamMembership[] = [];
  const seen = new Set<string>();
  const groupIdSet = new Set(groupIds);
  for (const entry of map.entries) {
    if (!groupIdSet.has(entry.entraGroupId)) continue;
    const key = `${entry.workspaceId}:${entry.teamCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    teamMemberships.push({
      workspaceId: entry.workspaceId,
      teamCode: entry.teamCode,
      teamDisplayName: entry.teamDisplayName,
    });
  }
  return { isAdmin, teamMemberships };
}

async function collectGroupIds(
  claims: IdTokenClaims,
  accessToken: string,
  fetchOverage: ResolveDeps['fetchGroupsOverage'],
): Promise<string[]> {
  if (Array.isArray(claims.groups) && claims.groups.length > 0) return claims.groups;
  if (claims._claim_names?.groups) return fetchOverage(accessToken);
  return [];
}
