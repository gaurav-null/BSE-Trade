import { useMemo } from 'react';
import { fmtCompactINR, fmtInt } from '../utils/format.js';

export default function StatsRow({ trades }) {
  const stats = useMemo(() => {
    let value = 0;
    const symbols = new Set();
    const clients = new Set();
    for (const t of trades) {
      value += t.quantity * t.price;
      symbols.add(t.symbol);
      clients.add(t.client);
    }
    return { count: trades.length, value, symbols: symbols.size, clients: clients.size };
  }, [trades]);

  const cards = [
    ['Trades', fmtInt(stats.count)],
    ['Traded value', fmtCompactINR(stats.value)],
    ['Symbols', fmtInt(stats.symbols)],
    ['Clients', fmtInt(stats.clients)],
  ];

  return (
    <section className="stats">
      {cards.map(([label, value]) => (
        <div className="panel stat" key={label}>
          <span className="muted small">{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}
