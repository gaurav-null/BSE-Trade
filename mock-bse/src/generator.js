

const SYMBOLS = [
  ['RELIANCE', 2900], ['TCS', 4100], ['HDFCBANK', 1650], ['INFY', 1800],
  ['ICICIBANK', 1250], ['SBIN', 830], ['BHARTIARTL', 1580], ['ITC', 470],
  ['LT', 3600], ['KOTAKBANK', 1780], ['AXISBANK', 1150], ['HINDUNILVR', 2450],
  ['MARUTI', 12300], ['SUNPHARMA', 1800], ['TATAMOTORS', 950], ['WIPRO', 560],
  ['ASIANPAINT', 2900], ['BAJFINANCE', 7200], ['TITAN', 3400], ['NTPC', 370],
];

const SURNAMES = ['Kothari', 'Mehta', 'Iyer', 'Banerjee', 'Reddy', 'Chopra', 'Nair', 'Desai'];
const SUFFIXES = ['Securities', 'Capital', 'Wealth', 'Investments', 'Traders'];
const CLIENTS = SURNAMES.flatMap((s) => SUFFIXES.map((x) => `${s} ${x}`)); // 40 clients

const QUANTITIES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

const TRADES_PER_SESSION = 1000;
const SESSION_START_UTC_SECONDS = 3 * 3600 + 45 * 60;
const SECONDS_PER_TRADE = 22.5; 
const FIRST_SESSION = Date.UTC(2026, 10, 2); 

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sessionDate(sessionIndex) {
  const d = new Date(FIRST_SESSION);
  let remaining = sessionIndex;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const weekday = d.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1; // skip weekends
  }
  return d.getTime();
}

export function tradeAt(i, seed) {
  const rnd = mulberry32(seed ^ Math.imul(i + 1, 0x9e3779b1));
  const [symbol, basePrice] = SYMBOLS[Math.floor(rnd() * SYMBOLS.length)];
  const client = CLIENTS[Math.floor(rnd() * CLIENTS.length)];
  const quantity = QUANTITIES[Math.floor(rnd() * QUANTITIES.length)];
  const price = Math.round(basePrice * (1 + (rnd() - 0.5) * 0.04) * 100) / 100;

  const session = Math.floor(i / TRADES_PER_SESSION);
  const slot = i % TRADES_PER_SESSION;
  const offsetSeconds = SESSION_START_UTC_SECONDS + slot * SECONDS_PER_TRADE + Math.floor(rnd() * 22);
  const timestamp = new Date(sessionDate(session) + offsetSeconds * 1000).toISOString();

  return {
    tradeId: `TRD-${String(i + 1).padStart(7, '0')}`,
    client,
    symbol,
    quantity,
    price,
    timestamp,
  };
}
