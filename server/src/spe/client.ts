import {
  Client,
  AuthenticationHandler,
  HTTPMessageHandler,
  type AuthenticationProvider,
  type GraphRequest,
  type Middleware,
} from '@microsoft/microsoft-graph-client';
import { UpstreamError } from '../errors/domain.js';
import { mapGraphErrorToDomain, type GraphLikeError, type GraphTokenAcquirer } from './types.js';

class TokenAcquirerProvider implements AuthenticationProvider {
  constructor(private readonly acquire: GraphTokenAcquirer) {}
  async getAccessToken(): Promise<string> {
    return this.acquire();
  }
}

export interface SpeGraphClient {
  api(path: string): GraphRequest;
}

export function createGraphClient(acquire: GraphTokenAcquirer): SpeGraphClient {
  // Use a minimal middleware chain: auth → http.
  // No RetryHandler — throttling/retry is handled at the call-site via UpstreamError.
  const authHandler = new AuthenticationHandler(new TokenAcquirerProvider(acquire));
  const httpHandler = new HTTPMessageHandler();
  authHandler.setNext(httpHandler);

  const inner = Client.initWithMiddleware({
    middleware: authHandler as Middleware,
    defaultVersion: 'v1.0',
  });
  return {
    api(path) {
      const req = inner.api(path);
      const proxy: GraphRequest = new Proxy(req, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (typeof value !== 'function') return value;
          if (!['get', 'post', 'put', 'patch', 'delete', 'getStream', 'putStream'].includes(String(prop))) {
            return value.bind(target);
          }
          return async (...args: unknown[]) => {
            try {
              return await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
            } catch (err) {
              if (err !== null && typeof err === 'object' && 'statusCode' in err) {
                throw mapGraphErrorToDomain(err as GraphLikeError);
              }
              throw new UpstreamError('Graph request failed', { upstream: String(err) }, err);
            }
          };
        },
      });
      return proxy;
    },
  };
}
