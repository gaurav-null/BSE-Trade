import { useMemo, useState } from 'react';
import { fmtDateTime, fmtInt, fmtPrice } from '../utils/format.js';

const PAGE_SIZE = 50;

const COLUMNS = [
  { key: 'tradeId', label: 'Trade ID' },
  { key: 'client', label: 'Client' },
  { key: 'symbol', label: 'Symbol' },
  { key: 'quantity', label: 'Qty', numeric: true },
  { key: 'price', label: 'Price (₹)', numeric: true },
  { key: 'value', label: 'Value (₹)', numeric: true },
  { key: 'timestamp', label: 'Traded at' },
];

const valueOf = (t, key) => (key === 'value' ? t.quantity * t.price : t[key]);

export default function TradesTable({ trades, freshFromSeq, activePull }) {
  const [query, setQuery] = useState('');
  const [symbol, setSymbol] = useState('');
  const [sort, setSort] = useState({ key: 'timestamp', dir: 'desc' });
  const [page, setPage] = useState(0);

  const symbols = useMemo(() => [...new Set(trades.map((t) => t.symbol))].sort(), [trades]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = trades.filter(
      (t) =>
        (!symbol || t.symbol === symbol) &&
        (!needle ||
          t.tradeId.toLowerCase().includes(needle) ||
          t.client.toLowerCase().includes(needle) ||
          t.symbol.toLowerCase().includes(needle)),
    );
    const dir = sort.dir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      const x = valueOf(a, sort.key);
      const y = valueOf(b, sort.key);
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [trades, query, symbol, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const toggleSort = (key) => {
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
    setPage(0);
  };

  if (trades.length === 0) {
    return (
      <div className="panel empty">
        {activePull
          ? 'No trades yet — the first pull is still running. This page will fill in automatically when it completes.'
          : 'No trades yet.'}
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search ID, client, symbol"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          value={symbol}
          onChange={(e) => {
            setSymbol(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All symbols</option>
          {symbols.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="muted small grow">
          {fmtInt(rows.length)} of {fmtInt(trades.length)} trades
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={c.numeric ? 'num' : ''}
                  onClick={() => toggleSort(c.key)}
                  aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  {c.label}
                  {sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t.seq} className={t.seq > freshFromSeq ? 'fresh' : ''}>
                <td className="mono">{t.tradeId}</td>
                <td>{t.client}</td>
                <td>
                  <span className="symbol">{t.symbol}</span>
                </td>
                <td className="num">{fmtInt(t.quantity)}</td>
                <td className="num">{fmtPrice(t.price)}</td>
                <td className="num">{fmtPrice(t.quantity * t.price)}</td>
                <td className="mono">{fmtDateTime(t.timestamp)}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="empty">
                  No trades match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button disabled={current === 0} onClick={() => setPage(current - 1)}>
          ← Prev
        </button>
        <span className="muted small">
          Page {current + 1} of {pageCount}
        </span>
        <button disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
          Next →
        </button>
      </div>
    </section>
  );
}
