import db from '../config/database.js';

const sql = {
  insert: db.prepare(`INSERT INTO pulls (status, active, requested_at) VALUES ('starting', 1, ?)`),
  byId: db.prepare('SELECT * FROM pulls WHERE id = ?'),
  byJob: db.prepare('SELECT * FROM pulls WHERE bse_job_id = ?'),
  active: db.prepare('SELECT * FROM pulls WHERE active = 1'),
  lastCompleted: db.prepare(`SELECT * FROM pulls WHERE status = 'completed' ORDER BY id DESC LIMIT 1`),
  lastFailedAfter: db.prepare(`SELECT * FROM pulls WHERE status = 'failed' AND id > ? ORDER BY id DESC LIMIT 1`),
  recent: db.prepare('SELECT * FROM pulls ORDER BY id DESC LIMIT ?'),
  any: db.prepare('SELECT 1 FROM pulls LIMIT 1'),
};

export const Pull = {
  createActive() {
    try {
      return Number(sql.insert.run(new Date().toISOString()).lastInsertRowid);
    } catch (err) {
      if (String(err.code).startsWith('SQLITE_CONSTRAINT')) return null;
      throw err;
    }
  },

  findById: (id) => sql.byId.get(id),
  findByJobId: (jobId) => sql.byJob.get(jobId),
  findActive: () => sql.active.get(),
  findAllActive: () => sql.active.all(),
  findLastCompleted: () => sql.lastCompleted.get(),
  findLastFailedAfter: (id) => sql.lastFailedAfter.get(id),
  findRecent: (limit) => sql.recent.all(limit),
  exists: () => Boolean(sql.any.get()),

  update(id, fields) {
    const assignments = Object.keys(fields)
      .map((key) => `${key} = @${key}`)
      .join(', ');
    db.prepare(`UPDATE pulls SET ${assignments} WHERE id = @id`).run({ ...fields, id });
    return sql.byId.get(id);
  },
};
