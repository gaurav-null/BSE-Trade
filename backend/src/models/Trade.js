import db from '../config/database.js';

const sql = {
  insert: db.prepare(`
    INSERT INTO trades (trade_id, client, symbol, quantity, price, traded_at, pull_id, ingested_at)
    VALUES (@tradeId, @client, @symbol, @quantity, @price, @timestamp, @pullId, @ingestedAt)
    ON CONFLICT(trade_id) DO NOTHING`),
  after: db.prepare(`
    SELECT seq, trade_id AS tradeId, client, symbol, quantity, price, traded_at AS timestamp
    FROM trades WHERE seq > ? ORDER BY seq LIMIT ?`),
  totals: db.prepare('SELECT COUNT(*) AS count, COALESCE(MAX(seq), 0) AS maxSeq FROM trades'),
};

export const Trade = {
  insertIfNew(trade, pullId, ingestedAt) {
    return sql.insert.run({
      tradeId: trade.tradeId,
      client: trade.client,
      symbol: trade.symbol,
      quantity: trade.quantity,
      price: trade.price,
      timestamp: trade.timestamp,
      pullId,
      ingestedAt,
    }).changes;
  },

  findAfter: (afterSeq, limit) => sql.after.all(afterSeq, limit),

  totals: () => sql.totals.get(),
};
