import { pullService } from '../services/pullService.js';

export const health = (_req, res) => res.json({ ok: true });
export const getState = (_req, res) => res.json(pullService.state());
