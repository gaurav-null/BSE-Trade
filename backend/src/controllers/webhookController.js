import { verify } from '@bse/shared/signature';
import { config } from '../config/index.js';
import { pullService } from '../services/pullService.js';

export function receiveBseWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!verify(config.webhookSecret, raw, req.get('x-bse-signature'))) {
    return res.status(401).json({ error: 'bad_signature' });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'bad_json' });
  }
  if (!payload.jobId || payload.status !== 'ready') {
    return res.status(400).json({ error: 'unsupported_event' });
  }

  const { code, body } = pullService.handleWebhook(payload.jobId);
  return res.status(code).json(body);
}
