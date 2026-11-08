import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './index.js';

fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    seq         INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id    TEXT    NOT NULL UNIQUE,          -- idempotency key
    client      TEXT    NOT NULL,
    symbol      TEXT    NOT NULL,
    quantity    INTEGER NOT NULL,
    price       REAL    NOT NULL,
    traded_at   TEXT    NOT NULL,
    pull_id     INTEGER,
    ingested_at TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pulls (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    status        TEXT    NOT NULL,  
    active        INTEGER,            
    bse_job_id    TEXT,
    requested_at  TEXT    NOT NULL,
    eta           TEXT,
    ready_at      TEXT,
    completed_at  TEXT,
    total_records INTEGER,
    fetched       INTEGER NOT NULL DEFAULT 0,
    inserted      INTEGER NOT NULL DEFAULT 0,
    cursor        INTEGER NOT NULL DEFAULT 0,  
    error         TEXT
  );
  
  CREATE UNIQUE INDEX IF NOT EXISTS one_active_pull ON pulls(active);
  CREATE INDEX IF NOT EXISTS pulls_job ON pulls(bse_job_id);

 
  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

export default db;
