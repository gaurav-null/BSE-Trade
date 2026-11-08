
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { sign } from '../shared/src/signature.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BSE_PORT = 5101;
const API_PORT = 5100;
const DELAY = Number(process.env.E2E_DELAY_MS ?? 6000);
const CAP = Number(process.env.E2E_CAP_MS ?? 5000);
const SECRET = 'e2e-secret';
const api = `http://localhost:${API_PORT}`;
const bse = `http://localhost:${BSE_PORT}`;
const tmp = mkdtempSync(path.join(tmpdir(), 'bse-e2e-'));

const children = [];
const logs = { bse: '', api: '' };
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? '  ✔' : '  ✘'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

function launch(name, cwd, env, entry = 'src/index.js') {
  const child = spawn('node', [entry], {
    cwd: path.join(ROOT, cwd),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const collect = (d) => {
    logs[name] += d.toString();
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  children.push(child);
  return child;
}

const startBse = () =>
  launch('bse', 'mock-bse', {
    PORT: BSE_PORT,
    PULL_DELAY_MS: DELAY,
    CONNECTION_CAP_MS: CAP,
    WEBHOOK_SECRET: SECRET,
    WEBHOOK_RETRIES: 3,
    WEBHOOK_RETRY_BASE_MS: 300,
  });

const startApi = () =>
  launch('api', 'backend', {
    PORT: API_PORT,
    BSE_URL: bse,
    DB_PATH: path.join(tmp, 'trades.db'),
    WEBHOOK_SECRET: SECRET,
    CONNECTION_CAP_MS: CAP,
    SSE_MAX_AGE_MS: Math.floor(CAP * 0.6),
    SSE_HEARTBEAT_MS: 1000,
    BSE_TIMEOUT_MS: CAP - 1000,
  }, 'src/server.js');

async function waitFor(fn, timeoutMs, what) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await sleep(100);
  }
}

const getJson = async (url) => (await fetch(url)).json();
const waitUp = (url) =>
  waitFor(() => fetch(url).then((r) => r.ok, () => false), 10_000, `${url} to come up`);

function startSseClient() {
  const events = [];
  let lastId = null;
  let connects = 0;
  let stopped = false;

  (async () => {
    while (!stopped) {
      try {
        const res = await fetch(`${api}/api/events`, {
          headers: lastId === null ? {} : { 'Last-Event-ID': String(lastId) },
        });
        connects += 1;
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of res.body) {
          buffer += decoder.decode(chunk, { stream: true });
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const fields = {};
            for (const line of frame.split('\n')) {
              const i = line.indexOf(':');
              if (i > 0) fields[line.slice(0, i)] = line.slice(i + 1).trim();
            }
            if (!fields.event) continue; // comment / retry
            if (fields.id) lastId = Number(fields.id);
            events.push({ type: fields.event, id: Number(fields.id ?? 0), data: JSON.parse(fields.data) });
          }
        }
      } catch {
        /* server down / killed - reconnect */
      }
      await sleep(250);
    }
  })();

  return {
    events,
    connects: () => connects,
    stop: () => {
      stopped = true;
    },
    waitForEvent: (type, predicate = () => true, timeoutMs = DELAY + 20_000) =>
      waitFor(() => events.find((e) => e.type === type && predicate(e.data)), timeoutMs, type),
  };
}

async function allTrades() {
  const out = [];
  let after = 0;
  for (;;) {
    const page = await getJson(`${api}/api/trades?afterSeq=${after}&limit=1000`);
    out.push(...page.trades);
    after = page.lastSeq;
    if (!page.hasMore) return out;
  }
}

async function main() {
  console.log(`\nE2E  cap=${CAP} ms  pull=${DELAY} ms  (pull is LONGER than the connection cap)\n`);

  startBse();
  let apiProc = startApi();
  await Promise.all([waitUp(`${bse}/health`), waitUp(`${api}/health`)]);
  const sse = startSseClient();

  console.log('1. Dashboard opens instantly, even before any data exists and while a pull runs');
  const first = await waitFor(
    async () => (await getJson(`${api}/api/state`)).activePull?.status === 'pending' && true,
    5000,
    'first pull to be pending',
  );
  check('first boot started a pull automatically', first === true);
  let t0 = Date.now();
  let page = await getJson(`${api}/api/trades`);
  check('GET /api/trades answers immediately while pull #1 runs', Date.now() - t0 < 300, `${Date.now() - t0} ms`);
  check('...and is simply empty on a first run', page.trades.length === 0);

  console.log('\n2. Only one pull at a time');
  let res = await fetch(`${api}/api/pulls`, { method: 'POST' });
  check('second POST /api/pulls while one is running -> 409', res.status === 409, `HTTP ${res.status}`);

  console.log('\n3. Pull completes -> pushed to the open dashboard (no polling)');
  const done1 = await sse.waitForEvent('pull_completed', (d) => d.pull.id === 1);
  check('SSE delivered pull_completed for pull #1', Boolean(done1), `event id ${done1.id}`);
  check('SSE stream was cycled under the cap (reconnected with Last-Event-ID)', sse.connects() >= 2, `${sse.connects()} connections`);
  let trades = await allTrades();
  check('3000 trades stored', trades.length === 3000, `${trades.length}`);
  check('no duplicate trade IDs', new Set(trades.map((t) => t.tradeId)).size === trades.length);

  console.log('\n4. Existing trades stay visible while the next pull is in flight');
  res = await fetch(`${api}/api/pulls`, { method: 'POST' });
  check('POST /api/pulls starts pull #2 (202)', res.status === 202, `HTTP ${res.status}`);
  t0 = Date.now();
  page = await getJson(`${api}/api/trades?limit=5000`);
  check('trades from pull #1 are served instantly during pull #2', page.trades.length === 3000 && Date.now() - t0 < 300, `${Date.now() - t0} ms`);

  console.log('\n5. Crash recovery: API is killed mid-pull and misses the BSE webhook entirely');
  apiProc.kill('SIGKILL');
  await sleep(DELAY + 3500);
  check('BSE gave up on the webhook (API was down)', logs.bse.includes('giving up on webhook'));
  apiProc = startApi();
  await waitUp(`${api}/health`);
  const done2 = await sse.waitForEvent('pull_completed', (d) => d.pull.id === 2, 20_000);
  check('on restart the API reconciled with the BSE and finished pull #2', Boolean(done2));
  const { pull: p2, newTrades } = done2.data;
  check('only the 250 new trades were inserted (idempotent upsert)', p2.inserted === 250 && newTrades === 250, `inserted=${p2.inserted}, fetched=${p2.fetched}`);
  trades = await allTrades();
  check('3250 unique trades in total', trades.length === 3250 && new Set(trades.map((t) => t.tradeId)).size === 3250, `${trades.length}`);

  console.log('\n6. Webhook hardening');
  const { pulls } = await getJson(`${api}/api/pulls`);
  const jobId = pulls.find((p) => p.id === 2).bseJobId;
  const body = JSON.stringify({ jobId, status: 'ready' });
  res = await fetch(`${api}/webhooks/bse`, { method: 'POST', body, headers: { 'x-bse-signature': 'sha256=bad' } });
  check('bad signature rejected (401)', res.status === 401, `HTTP ${res.status}`);
  res = await fetch(`${api}/webhooks/bse`, { method: 'POST', body, headers: { 'x-bse-signature': sign(SECRET, body) } });
  const dup = await res.json();
  check('duplicate webhook acknowledged and ignored', res.status === 200 && dup.duplicate === true, `HTTP ${res.status}`);
  check('...without changing the data', (await allTrades()).length === 3250);

  console.log('\n7. Why the job pattern is needed: a blocking pull dies at the cap');
  const started = Date.now();
  const outcome = await fetch(`${bse}/getTrades?blocking=1`).then(
    (r) => r.text().then(() => 'completed', () => 'killed'),
    () => 'killed',
  );
  check('holding one connection for the whole pull is killed by the network', outcome === 'killed', `after ${Date.now() - started} ms`);

  console.log('\n8. The API never exceeded the cap');
  check('no API connection was killed by the cap', !logs.api.includes('[netcap:api] killed'));
}

try {
  await main();
} catch (err) {
  failures += 1;
  console.error('\nTest run aborted:', err.message);
} finally {
  for (const child of children) child.kill('SIGKILL');
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
if (failures) console.log('--- api log ---\n' + logs.api + '\n--- bse log ---\n' + logs.bse);
process.exit(failures === 0 ? 0 : 1);
