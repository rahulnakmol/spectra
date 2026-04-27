import { NotFoundError } from '../errors/domain.js';
import type { SpeGraphClient } from '../spe/index.js';
import type { ConfigReader, ConfigWriter } from './configStore.js';

export interface SessionDeleter { (path: string): Promise<void>; }

function normalize(p: string): string {
  return p.startsWith('/') ? p.slice(1) : p;
}

export function createSpeReader(client: SpeGraphClient, driveId: string): ConfigReader {
  return async (path) => {
    try {
      const resp = await client
        .api(`/drives/${driveId}/root:/${normalize(path)}:/content`)
        .responseType('text' as never)
        .get();
      return typeof resp === 'string' ? resp : JSON.stringify(resp);
    } catch (err) {
      // When responseType is 'text', the SDK may not parse the error body and
      // leaves code as null. Re-map any 404-status error to NotFoundError so
      // ConfigStore's not_found check works correctly.
      const e = err as { code?: string | null; status?: number; statusCode?: number };
      if (e.status === 404 || e.statusCode === 404 || e.code === 'not_found') {
        throw new NotFoundError('File not found in SPE drive');
      }
      throw err;
    }
  };
}

export function createSpeWriter(client: SpeGraphClient, driveId: string): ConfigWriter {
  return async (path, body) => {
    await client
      .api(`/drives/${driveId}/root:/${normalize(path)}:/content`)
      .header('Content-Type', 'application/json')
      .put(body);
  };
}

export function createSpeDeleter(client: SpeGraphClient, driveId: string): SessionDeleter {
  return async (path) => {
    await client.api(`/drives/${driveId}/root:/${normalize(path)}:`).delete();
  };
}
