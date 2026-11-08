async function json(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  return { ok: res.ok, status: res.status, body: body ?? {} };
}

/** One page of trades with seq > afterSeq. */
export async function fetchTrades(afterSeq) {
  const res = await fetch(`/api/trades?afterSeq=${afterSeq}&limit=5000`);
  if (!res.ok) throw new Error(`GET /api/trades failed with ${res.status}`);
  return res.json();
}

export const startPull = () => fetch('/api/pulls', { method: 'POST' }).then(json);
export const resumePull = (id) => fetch(`/api/pulls/${id}/resume`, { method: 'POST' }).then(json);
