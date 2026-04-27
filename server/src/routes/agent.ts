import { Router } from 'express';

export function agentRouter(): Router {
  const r = Router();
  r.all('/api/agent/*', (_req, res) => {
    res.status(501).json({
      error: 'not_implemented',
      message: 'AI agent surface is reserved and not yet implemented',
    });
  });
  return r;
}
