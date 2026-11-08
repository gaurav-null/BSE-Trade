
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import { enforceConnectionCap } from '@bse/shared/netcap';
import { sign } from '@bse/shared/signature';
import { tradeAt } from './generator.js';

const num = (key, fallback) => (process.env[key] !== undefined ? Number(process.env[key]) : fallback);

const cfg = {
  port: num('PORT', 4001),
  delayMs: num('PULL_DELAY_MS', 15 * 60 * 1000),
  baseTrades: num('BASE_TRADES', 3000),
  growthPerPull: num('GROWTH_PER_PULL', 250), 
  seed: num('SEED', 42),
  secret: process.env.WEBHOOK_SECRET ?? 'dev-webhook-secret',
  capMs: num('CONNECTION_CAP_MS', 30_000),
  webhookRetries: num('WEBHOOK_RETRIES', 5),
  webhookRetryBaseMs: num('WEBHOOK_RETRY_BASE_MS', 2000),
};

const jobs = new Map();
let jobsCreated = 0;

const iso = (ms) => new Date(ms).toISOString();
const isReady = (job) => Date.now() >= job.readyAt;

function createJob(callbackUrl) {
  const now = Date.now();
  const job = {
    id: `job_${crypto.randomBytes(6).toString('hex')}`,
    total: cfg.baseTrades + cfg.growthPerPull * jobsCreated,
    createdAt: now,
    readyAt: now + cfg.delayMs,
    callbackUrl,
  };
  jobsCreated += 1;
  jobs.set(job.id, job);
  if (callbackUrl) setTimeout(() => deliverWebhook(job), cfg.delayMs);
  return job;
}

function describeJob(job) {
  const elapsed = Date.now() - job.createdAt;
  return {
    jobId: job.id,
    status: isReady(job) ? 'ready' : 'pending',
    createdAt: iso(job.createdAt),
    readyAt: iso(job.readyAt),
    progress: Math.min(1, cfg.delayMs === 0 ? 1 : elapsed / cfg.delayMs),
    totalRecords: job.total,
  };
}

async function deliverWebhook(job, attempt = 0) {
  const body = JSON.stringify({
    jobId: job.id,
    status: 'ready',
    totalRecords: job.total,
    readyAt: iso(job.readyAt),
  });
  try {
    const res = await fetch(job.callbackUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bse-signature': sign(cfg.secret, body),
        'x-bse-delivery-attempt': String(attempt + 1),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`[bse] webhook delivered for ${job.id} (attempt ${attempt + 1})`);
  } catch (err) {
    if (attempt >= cfg.webhookRetries) {
      console.warn(`[bse] giving up on webhook for ${job.id}: ${err.message}`);
      return;
    }
    const wait = cfg.webhookRetryBaseMs * 2 ** attempt;
    console.warn(`[bse] webhook for ${job.id} failed (${err.message}); retrying in ${wait} ms`);
    setTimeout(() => deliverWebhook(job, attempt + 1), wait);
  }
}

const app = express();
app.disable('x-powered-by');

app.get('/health', (_req, res) => {
  res.json({ ok: true, delayMs: cfg.delayMs, jobs: jobs.size });
});

app.get('/getTrades', async (req, res) => {
  if (req.query.blocking === '1') {
    let aborted = false;
    res.on('close', () => {
      if (!res.writableFinished) aborted = true;
    });
    await new Promise((resolve) => setTimeout(resolve, cfg.delayMs));
    if (aborted) return;
    const trades = Array.from({ length: cfg.baseTrades }, (_, i) => tradeAt(i, cfg.seed));
    res.json({ totalRecords: trades.length, trades });
    return;
  }

  const callbackUrl = req.query.callbackUrl || req.get('x-callback-url') || null;
  if (callbackUrl && !/^https?:\/\//.test(callbackUrl)) {
    res.status(400).json({ error: 'callbackUrl must be an http(s) URL' });
    return;
  }

  const job = createJob(callbackUrl);
  console.log(`[bse] job ${job.id} created: ${job.total} trades, ready at ${iso(job.readyAt)}`);
  res
    .status(202)
    .location(`/getTrades/${job.id}`)
    .json({
      ...describeJob(job),
      links: { status: `/getTrades/${job.id}`, results: `/getTrades/${job.id}/results` },
    });
});

app.get('/getTrades/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'unknown_job' });
    return;
  }
  res.json(describeJob(job));
});

app.get('/getTrades/:jobId/results', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'unknown_job' });
    return;
  }
  if (!isReady(job)) {
    res.status(409).json({ error: 'not_ready', readyAt: iso(job.readyAt) });
    return;
  }
  const cursor = Math.max(0, Number(req.query.cursor ?? 0) || 0);
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit ?? 500) || 500));
  const end = Math.min(job.total, cursor + limit);
  const trades = [];
  for (let i = cursor; i < end; i += 1) trades.push(tradeAt(i, cfg.seed));
  res.json({
    jobId: job.id,
    totalRecords: job.total,
    cursor,
    nextCursor: end < job.total ? end : null,
    trades,
  });
});

const server = http.createServer(app);
enforceConnectionCap(server, cfg.capMs, 'bse');
server.listen(cfg.port, () => {
  console.log(
    `[bse] mock BSE on :${cfg.port} - pull takes ${cfg.delayMs} ms, ` +
      `${cfg.baseTrades}+${cfg.growthPerPull}/pull trades, connection cap ${cfg.capMs || 'off'} ms`,
  );
});
