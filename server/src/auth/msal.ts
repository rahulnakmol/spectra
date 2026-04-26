import type { ConfidentialClientApplication, AuthenticationResult } from '@azure/msal-node';

export interface MsalConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface IdTokenClaims {
  oid: string;
  tid: string;
  preferred_username: string;
  name: string;
  roles?: string[];
  groups?: string[];
  _claim_names?: { groups?: string };
}

export interface CodeExchangeResult {
  accessToken: string;
  idClaims: IdTokenClaims;
  homeAccountId: string;
  expiresOn: Date;
}

export interface MsalClient {
  buildAuthorizeUrl(opts: { state: string; codeChallenge: string }): Promise<string>;
  exchangeCode(opts: { code: string; codeVerifier: string }): Promise<CodeExchangeResult>;
  acquireOboToken(userAccessToken: string, scopes: string[]): Promise<string>;
  acquireAppToken(scopes: string[]): Promise<string>;
}

export interface MsalDeps {
  ConfidentialClientApplication: new (cfg: { auth: { clientId: string; authority: string; clientSecret: string } }) => ConfidentialClientApplication;
}

const GRAPH_OBO_SCOPES = [
  'https://graph.microsoft.com/Files.ReadWrite.All',
  'https://graph.microsoft.com/User.ReadBasic.All',
  'offline_access',
];

export function createMsalClient(cfg: MsalConfig, deps: MsalDeps): MsalClient {
  const cca = new deps.ConfidentialClientApplication({
    auth: {
      clientId: cfg.clientId,
      authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
      clientSecret: cfg.clientSecret,
    },
  });

  return {
    async buildAuthorizeUrl({ state, codeChallenge }) {
      return cca.getAuthCodeUrl({
        scopes: GRAPH_OBO_SCOPES,
        redirectUri: cfg.redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod: 'S256',
      });
    },
    async exchangeCode({ code, codeVerifier }) {
      const resp = (await cca.acquireTokenByCode({
        code,
        codeVerifier,
        redirectUri: cfg.redirectUri,
        scopes: GRAPH_OBO_SCOPES,
      })) as AuthenticationResult & { idTokenClaims: IdTokenClaims };
      if (!resp?.accessToken || !resp.idTokenClaims) throw new Error('MSAL token exchange returned no tokens');
      return {
        accessToken: resp.accessToken,
        idClaims: resp.idTokenClaims,
        homeAccountId: resp.account?.homeAccountId ?? '',
        expiresOn: resp.expiresOn ?? new Date(Date.now() + 3600_000),
      };
    },
    async acquireOboToken(userAccessToken, scopes) {
      const resp = await cca.acquireTokenOnBehalfOf({ oboAssertion: userAccessToken, scopes });
      if (!resp?.accessToken) throw new Error('MSAL OBO returned no token');
      return resp.accessToken;
    },
    async acquireAppToken(scopes) {
      const resp = await cca.acquireTokenByClientCredential({ scopes });
      if (!resp?.accessToken) throw new Error('MSAL app-only returned no token');
      return resp.accessToken;
    },
  };
}
