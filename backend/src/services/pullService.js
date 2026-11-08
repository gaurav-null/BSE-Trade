import { setTimeout as sleep } from 'node:timers/promises';
import { config } from '../config/index.js';
import db from '../config/database.js';
import { Pull } from '../models/Pull.js';
import { Trade } from '../models/Trade.js';
import { pullView } from '../views/pullView.js';
import { bseClient } from './bseClient.js';
import { eventBus } from './eventBus.js';


const running = new Set(); 

const emit = (type, row, extra = {}) => eventBus.publish(type, { pull: pullView(row), ...extra });

function state() {
  const active = Pull.findActive();
  const completed = Pull.findLastCompleted();
  const failed = Pull.findLastFailedAfter(completed?.id ?? 0);
  const { count, maxSeq } = Trade.totals();
  return {
    activePull: pullView(active),
    lastCompletedPull: pullView(completed),
    lastFailedPull: pullView(failed),
    tradeCount: count,
    maxSeq,
    lastEventId: eventBus.lastId(),
    serverTime: new Date().toISOString(),
  };
}

function fail(id, message) {
  const row = Pull.update(id, {
    status: 'failed',
    active: null,
    error: message,
    completed_at: new Date().toISOString(),
  });
  console.warn(`[pulls] #${id} failed: ${message}`);
  emit('pull_failed', row);
}

async function start() {
  const id = Pull.createActive();
  if (id === null) {
    return { started: false, pull: pullView(Pull.findActive()) };
  }
  emit('pull_started', Pull.findById(id));

  try {
    const job = await bseClient.createJob(`${config.publicUrl}/webhooks/bse`);
    const row = Pull.update(id, {
      status: 'pending',
      bse_job_id: job.jobId,
      eta: job.readyAt,
      total_records: job.totalRecords,
    });
    console.log(`[pulls] #${id} accepted by BSE as ${job.jobId}, ready around ${job.readyAt}`);
    emit('pull_pending', row);
    return { started: true, pull: pullView(row) };
  } catch (err) {
    fail(id, `Could not start the BSE pull: ${err.message}`);
    return { started: false, error: err.message, pull: pullView(Pull.findById(id)) };
  }
}

const savePage = db.transaction((id, page) => {
  const ingestedAt = new Date().toISOString();
  let inserted = 0;
  for (const trade of page.trades) inserted += Trade.insertIfNew(trade, id, ingestedAt);
  const current = Pull.findById(id);
  return Pull.update(id, {
    cursor: page.nextCursor ?? page.cursor + page.trades.length,
    fetched: current.fetched + page.trades.length,
    inserted: current.inserted + inserted,
  });
});

async function fetchPage(jobId, cursor) {
  let lastErr;
  for (let attempt = 1; attempt <= config.ingestRetries; attempt += 1) {
    try {
      return await bseClient.getResults(jobId, cursor, config.pageSize);
    } catch (err) {
      lastErr = err;
      console.warn(`[pulls] page @${cursor} failed (attempt ${attempt}/${config.ingestRetries}): ${err.message}`);
      if (attempt < config.ingestRetries) await sleep(config.ingestRetryBaseMs * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

async function ingest(id) {
  if (running.has(id)) return;
  running.add(id);
  try {
    let pull = Pull.findById(id);
    if (!pull || !pull.active) return;

    pull = Pull.update(id, {
      status: 'ingesting',
      ready_at: pull.ready_at ?? new Date().toISOString(),
      error: null,
    });
    emit('pull_ingesting', pull);

    let cursor = pull.cursor;
    for (;;) {
      const page = await fetchPage(pull.bse_job_id, cursor);
      pull = savePage(id, page);
      cursor = pull.cursor;
      emit('pull_progress', pull);
      if (page.nextCursor == null) break;
    }

    pull = Pull.update(id, { status: 'completed', active: null, completed_at: new Date().toISOString() });
    const { maxSeq } = Trade.totals();
    console.log(`[pulls] #${id} completed: ${pull.fetched} fetched, ${pull.inserted} new`);
    emit('pull_completed', pull, { maxSeq, newTrades: pull.inserted });
  } catch (err) {
    const row = Pull.update(id, { status: 'stalled', error: err.message });
    console.warn(`[pulls] #${id} stalled during ingest: ${err.message}`);
    emit('pull_stalled', row);
  } finally {
    running.delete(id);
  }
}

function handleWebhook(jobId) {
  const pull = Pull.findByJobId(jobId);
  if (!pull) return { code: 404, body: { error: 'unknown_job' } }; 
  if (pull.status === 'pending' || pull.status === 'stalled') {
    void ingest(pull.id); 
    return { code: 202, body: { ok: true } };
  }
  return { code: 200, body: { ok: true, duplicate: true } };
}

function resume(id) {
  const pull = Pull.findById(id);
  if (!pull) return { code: 404, pull: null };
  if (pull.status !== 'stalled') return { code: 409, pull: pullView(pull) };
  void ingest(id);
  return { code: 202, pull: pullView(pull) };
}

async function reconcile() {
  for (const pull of Pull.findAllActive()) {
    if (pull.status === 'starting') {
      fail(pull.id, 'Interrupted before the BSE accepted the request');
    } else if (pull.status === 'ingesting' || pull.status === 'stalled') {
      console.log(`[pulls] #${pull.id} resuming ingest from cursor ${pull.cursor}`);
      void ingest(pull.id);
    } else if (pull.status === 'pending') {
      try {
        const job = await bseClient.getJob(pull.bse_job_id);
        if (job.status === 'ready') {
          console.log(`[pulls] #${pull.id} finished while we were away - ingesting`);
          void ingest(pull.id);
        } else {
          console.log(`[pulls] #${pull.id} still pending at the BSE; waiting for its webhook`);
        }
      } catch (err) {
        if (err.status === 404) fail(pull.id, 'The BSE no longer knows this job');
        else console.warn(`[pulls] #${pull.id} could not be checked (${err.message}); relying on the webhook`);
      }
    }
  }
}

export const pullService = {
  state,
  start,
  resume,
  handleWebhook,
  reconcile,
  recent: (limit = 20) => Pull.findRecent(limit).map(pullView),
  hasAnyPull: () => Pull.exists(),
};
