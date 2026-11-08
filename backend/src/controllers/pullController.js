import { pullService } from '../services/pullService.js';

export const listPulls = (_req, res) => res.json({ pulls: pullService.recent(20) });
export async function createPull(_req, res) {
  const result = await pullService.start();
  if (result.started) return res.status(202).json({ pull: result.pull });
  if (result.error) return res.status(502).json({ error: result.error, pull: result.pull });
  return res.status(409).json({ error: 'pull_in_progress', pull: result.pull });
}
export function resumePull(req, res) {
  const { code, pull } = pullService.resume(Number(req.params.id));
  res.status(code).json({ pull });
}
