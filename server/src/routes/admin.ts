import { Router, type RequestHandler } from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  GroupRoleMapSchema, WorkspaceConfigSchema, type GroupRoleMapEntry,
  type WorkspaceConfig, type WorkspaceTemplate,
} from '@spectra/shared';
import { BadRequestError, NotFoundError, UnauthenticatedError } from '../errors/domain.js';
import { audit } from '../obs/audit.js';
import { requireAuth } from '../auth/session.js';
import { requireRole } from '../authz/guards.js';
import type { ConfigStore } from '../store/configStore.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(here, '../../templates/workspaces');

const CreateWorkspaceSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1).optional(),
  template: z.enum(['invoices', 'contracts', 'hr-docs', 'blank']),
});

const PatchWorkspaceSchema = z.object({
  displayName: z.string().min(1).optional(),
  archived: z.boolean().optional(),
});

const AuditQuerySchema = z.object({
  action: z.string().min(1).max(64).optional(),
  workspace: z.string().min(1).max(64).optional(),
  userOid: z.string().uuid().optional(),
  fromIso: z.string().datetime().optional(),
  toIso: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export interface AdminAuditEvent {
  timestamp: string;
  userOid: string;
  action: string;
  workspace?: string;
  resourceId?: string;
  outcome: 'success' | 'failure' | 'denied';
}

export interface AdminRouterDeps {
  store: ConfigStore;
  provisionContainer: (workspaceId: string, displayName: string) => Promise<string>;
  auditQuery: (q: z.infer<typeof AuditQuerySchema>) => Promise<{ events: AdminAuditEvent[] }>;
}

async function loadTemplate(name: WorkspaceTemplate): Promise<{
  displayName: string;
  template: WorkspaceTemplate;
  folderConvention: string[];
  metadataSchema: WorkspaceConfig['metadataSchema'];
}> {
  const file = path.join(TEMPLATE_DIR, `${name}.json`);
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw) as {
    displayName: string;
    template: WorkspaceTemplate;
    folderConvention: string[];
    metadataSchema: WorkspaceConfig['metadataSchema'];
  };
}

export function adminRouter(deps: AdminRouterDeps): Router {
  const r = Router();
  const guard = [requireAuth, requireRole('admin')];

  const listWs: RequestHandler = async (_req, res, next) => {
    try {
      const cfg = await deps.store.getWorkspaces();
      res.json({ workspaces: cfg.workspaces });
    } catch (err) { next(err); }
  };

  const createWs: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const parse = CreateWorkspaceSchema.safeParse(req.body);
      if (!parse.success) throw new BadRequestError('Invalid request', { issues: parse.error.message });
      const cfg = await deps.store.getWorkspaces();
      if (cfg.workspaces.some((w) => w.id === parse.data.id)) {
        throw new BadRequestError('Workspace id already exists');
      }
      const tpl = await loadTemplate(parse.data.template);
      const containerId = await deps.provisionContainer(parse.data.id, parse.data.displayName ?? tpl.displayName);
      const ws = WorkspaceConfigSchema.parse({
        id: parse.data.id,
        displayName: parse.data.displayName ?? tpl.displayName,
        template: parse.data.template,
        containerId,
        folderConvention: tpl.folderConvention,
        metadataSchema: tpl.metadataSchema,
        archived: false,
        createdAt: new Date().toISOString(),
        createdByOid: req.session.userOid,
      }) as WorkspaceConfig;
      await deps.store.putWorkspaces({ workspaces: [...cfg.workspaces, ws] });
      audit({ userOid: req.session.userOid, action: 'admin.workspace.create', workspace: ws.id, outcome: 'success' });
      res.status(201).json({ workspace: ws });
    } catch (err) { next(err); }
  };

  const patchWs: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const parse = PatchWorkspaceSchema.safeParse(req.body);
      if (!parse.success) throw new BadRequestError('Invalid patch', { issues: parse.error.message });
      const cfg = await deps.store.getWorkspaces();
      const idx = cfg.workspaces.findIndex((w) => w.id === req.params['ws']);
      if (idx < 0) throw new NotFoundError('Workspace not found');
      const existing = cfg.workspaces[idx];
      if (!existing) throw new NotFoundError('Workspace not found');
      const updated: WorkspaceConfig = {
        ...existing,
        ...(parse.data.displayName !== undefined ? { displayName: parse.data.displayName } : {}),
        ...(parse.data.archived !== undefined ? { archived: parse.data.archived } : {}),
      };
      const updatedList = [...cfg.workspaces];
      updatedList[idx] = updated;
      await deps.store.putWorkspaces({ workspaces: updatedList });
      audit({ userOid: req.session.userOid, action: 'admin.workspace.update', workspace: updated.id, outcome: 'success' });
      res.json({ workspace: updated });
    } catch (err) { next(err); }
  };

  const getMap: RequestHandler = async (_req, res, next) => {
    try {
      const map = await deps.store.getGroupRoleMap();
      res.json(map);
    } catch (err) { next(err); }
  };

  const putMap: RequestHandler = async (req, res, next) => {
    try {
      if (!req.session) throw new UnauthenticatedError();
      const parse = GroupRoleMapSchema.safeParse(req.body);
      if (!parse.success) throw new BadRequestError('Invalid mapping', { issues: parse.error.message });
      const seen = new Set<string>();
      for (const e of parse.data.entries as GroupRoleMapEntry[]) {
        const key = `${e.entraGroupId}|${e.workspaceId}|${e.teamCode}`;
        if (seen.has(key)) throw new BadRequestError(`Duplicate mapping ${key}`);
        seen.add(key);
      }
      await deps.store.putGroupRoleMap(parse.data);
      audit({ userOid: req.session.userOid, action: 'admin.group_mapping.replace', outcome: 'success', detail: { count: parse.data.entries.length } });
      res.json(parse.data);
    } catch (err) { next(err); }
  };

  const auditEndpoint: RequestHandler = async (req, res, next) => {
    try {
      const parse = AuditQuerySchema.safeParse(req.query);
      if (!parse.success) throw new BadRequestError('Invalid audit query', { issues: parse.error.message });
      const out = await deps.auditQuery(parse.data);
      res.json(out);
    } catch (err) { next(err); }
  };

  r.get('/api/admin/workspaces', ...guard, listWs);
  r.post('/api/admin/workspaces', ...guard, createWs);
  r.patch('/api/admin/workspaces/:ws', ...guard, patchWs);
  r.get('/api/admin/group-mapping', ...guard, getMap);
  r.put('/api/admin/group-mapping', ...guard, putMap);
  r.get('/api/admin/audit', ...guard, auditEndpoint);
  return r;
}
