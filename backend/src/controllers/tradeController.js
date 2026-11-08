import { Trade } from '../models/Trade.js';

export function listTrades(req, res) {
  const afterSeq = Math.max(0, Number(req.query.afterSeq ?? 0) || 0);
  const limit = Math.min(10_000, Math.max(1, Number(req.query.limit ?? 5000) || 5000));

  const rows = Trade.findAfter(afterSeq, limit + 1); // one extra row tells us if there is more
  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  res.json({ trades: rows, lastSeq: rows.at(-1)?.seq ?? afterSeq, hasMore });
}
