import path from 'node:path';

const num = (key, fallback) => (process.env[key] !== undefined ? Number(process.env[key]) : fallback);

const port = num('PORT', 4000);

export const config = {
  port,
  bseUrl: process.env.BSE_URL ?? 'http://localhost:4001',
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${port}`,
  webhookSecret: process.env.WEBHOOK_SECRET ?? 'dev-webhook-secret',
  dbPath: process.env.DB_PATH ?? path.resolve('data/trades.db'),
  frontendDist: process.env.FRONTEND_DIST ?? path.resolve(import.meta.dirname, '../../../frontend/dist'),
  capMs: num('CONNECTION_CAP_MS', 30_000),
  bseTimeoutMs: num('BSE_TIMEOUT_MS', 20_000), // our own calls to the BSE
  sseMaxAgeMs: num('SSE_MAX_AGE_MS', 25_000),
  sseHeartbeatMs: num('SSE_HEARTBEAT_MS', 10_000),
  sseRetryMs: num('SSE_RETRY_MS', 500),
  pageSize: num('PAGE_SIZE', 500),
  ingestRetries: num('INGEST_RETRIES', 3),
  ingestRetryBaseMs: num('INGEST_RETRY_BASE_MS', 1000),

  autoPullOnStart: process.env.AUTO_PULL_ON_START !== 'false',
};
