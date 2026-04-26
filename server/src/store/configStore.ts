import { LRUCache } from 'lru-cache';
import {
  AppSettingsSchema, GroupRoleMapSchema, WorkspacesConfigSchema,
  type AppSettings, type GroupRoleMapEntry, type WorkspaceConfig,
} from '@spectra/shared';

const PATH_WORKSPACES = '/config/workspaces.json';
const PATH_GROUP_MAP = '/config/group-role-map.json';
const PATH_APP_SETTINGS = '/config/app-settings.json';

export interface ConfigReader { (path: string): Promise<string>; }
export interface ConfigWriter { (path: string, body: string): Promise<void>; }
export interface ConfigStore {
  getWorkspaces(): Promise<{ workspaces: WorkspaceConfig[] }>;
  getGroupRoleMap(): Promise<{ entries: GroupRoleMapEntry[] }>;
  getAppSettings(): Promise<AppSettings>;
  putWorkspaces(value: { workspaces: WorkspaceConfig[] }): Promise<void>;
  putGroupRoleMap(value: { entries: GroupRoleMapEntry[] }): Promise<void>;
  putAppSettings(value: AppSettings): Promise<void>;
  invalidate(): void;
}
interface Opts { reader: ConfigReader; writer?: ConfigWriter; ttlMs?: number; }

const DEFAULT_APP_SETTINGS: AppSettings = {
  brandName: 'Docs Vault',
  welcomePitch: 'Secure file management for every team.',
  defaultTheme: 'light',
};

export function createConfigStore(opts: Opts): ConfigStore {
  // lru-cache v10 requires the value type to extend {}; use `object` and cast at read sites.
  const cache = new LRUCache<string, object>({ max: 16, ttl: opts.ttlMs ?? 60_000 });

  async function readParsed<T extends object>(path: string, parse: (raw: unknown) => T, fallback: T): Promise<T> {
    const cached = cache.get(path) as T | undefined;
    if (cached !== undefined) return cached;
    let raw: string;
    try { raw = await opts.reader(path); }
    catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'not_found' || (err as { status?: number }).status === 404) {
        cache.set(path, fallback);
        return fallback;
      }
      throw err;
    }
    const json = JSON.parse(raw) as unknown;
    const parsed = parse(json);
    cache.set(path, parsed);
    return parsed;
  }

  async function write(path: string, value: object): Promise<void> {
    if (!opts.writer) throw new Error('ConfigStore: writer not provided');
    await opts.writer(path, JSON.stringify(value, null, 2));
    cache.delete(path);
  }

  return {
    getWorkspaces: () =>
      readParsed(
        PATH_WORKSPACES,
        (j) => WorkspacesConfigSchema.parse(j) as { workspaces: WorkspaceConfig[] },
        { workspaces: [] },
      ),
    getGroupRoleMap: () =>
      readParsed(
        PATH_GROUP_MAP,
        (j) => GroupRoleMapSchema.parse(j) as { entries: GroupRoleMapEntry[] },
        { entries: [] },
      ),
    getAppSettings: () =>
      readParsed(
        PATH_APP_SETTINGS,
        (j) => AppSettingsSchema.parse(j) as AppSettings,
        DEFAULT_APP_SETTINGS,
      ),
    putWorkspaces: (v) => write(PATH_WORKSPACES, WorkspacesConfigSchema.parse(v) as object),
    putGroupRoleMap: (v) => write(PATH_GROUP_MAP, GroupRoleMapSchema.parse(v) as object),
    putAppSettings: (v) => write(PATH_APP_SETTINGS, AppSettingsSchema.parse(v) as object),
    invalidate: () => cache.clear(),
  };
}

export function startConfigPoller(store: ConfigStore, intervalMs = 5 * 60_000): { stop: () => void } {
  const t = setInterval(() => store.invalidate(), intervalMs).unref();
  return { stop: () => clearInterval(t) };
}
