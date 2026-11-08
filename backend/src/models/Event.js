import db from '../config/database.js';

const sql = {
  insert: db.prepare('INSERT INTO events (type, data, created_at) VALUES (?, ?, ?)'),
  prune: db.prepare('DELETE FROM events WHERE id <= ?'),
  since: db.prepare('SELECT id, type, data FROM events WHERE id > ? ORDER BY id'),
  last: db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM events'),
};
export const Event = {
  append: (type, dataJson) => Number(sql.insert.run(type, dataJson, new Date().toISOString()).lastInsertRowid),
  since: (id) => sql.since.all(id),
  lastId: () => sql.last.get().id,
  pruneUpTo: (id) => sql.prune.run(id),
};
