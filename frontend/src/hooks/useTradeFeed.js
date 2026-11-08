import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTrades } from '../services/api.js';

const PULL_EVENTS = [
  'pull_started',
  'pull_pending',
  'pull_ingesting',
  'pull_progress',
  'pull_stalled',
  'pull_failed',
  'pull_completed',
];

const EMPTY = { activePull: null, lastCompletedPull: null, lastFailedPull: null };

/**
 * Everything the dashboard needs, with no polling anywhere:
 *
 *  - On load: open the SSE stream and pull the trades already in the database
 *    (works the same whether or not a BSE pull is currently running).
 *  - While open: the server pushes pull progress, and a "pull_completed" event
 *    triggers exactly one incremental fetch ("trades after seq N").
 *  - The server ends each stream after ~25 s (network cap). EventSource
 *    reconnects by itself; the server replays what we missed and re-sends a
 *    state snapshot, so nothing is lost across reconnects.
 */
export function useTradeFeed() {
  const [trades, setTrades] = useState([]);
  const [pullState, setPullState] = useState(EMPTY);
  const [connection, setConnection] = useState('connecting'); // connecting | live | reconnecting
  const [loaded, setLoaded] = useState(false);
  const [freshFromSeq, setFreshFromSeq] = useState(Infinity); // rows with seq > this are "new"

  const maxSeq = useRef(0);
  const syncing = useRef(false);
  const dirty = useRef(false);
  const loadedOnce = useRef(false);

  // Incremental sync. Safe to call from anywhere, any number of times:
  // overlapping calls collapse into one loop that runs until nothing is dirty.
  const sync = useCallback(async () => {
    dirty.current = true;
    if (syncing.current) return;
    syncing.current = true;
    try {
      while (dirty.current) {
        dirty.current = false;
        const batchStart = maxSeq.current;
        let hasMore = true;
        while (hasMore) {
          const page = await fetchTrades(maxSeq.current);
          if (page.trades.length > 0) {
            maxSeq.current = page.lastSeq;
            setTrades((current) => current.concat(page.trades));
          }
          hasMore = page.hasMore;
        }
        if (loadedOnce.current && maxSeq.current > batchStart) setFreshFromSeq(batchStart);
        loadedOnce.current = true;
        setLoaded(true);
      }
    } catch (err) {
      // The next SSE (re)connect sends a state snapshot and triggers another sync.
      console.error('Trade sync failed', err);
    } finally {
      syncing.current = false;
    }
  }, []);

  useEffect(() => {
    let source;
    let retryTimer;
    let closed = false;

    function connect() {
      source = new EventSource('/api/events');
      let plannedEnd = false;

      source.onopen = () => {
        plannedEnd = false;
        setConnection('live');
      };

      source.onerror = () => {
        if (closed) return;
        if (!plannedEnd) setConnection('reconnecting');
        // EventSource retries network errors by itself, but gives up after an HTTP
        // error (e.g. a proxy 502 while the API restarts). Re-create it in that case.
        if (source.readyState === EventSource.CLOSED) {
          retryTimer = setTimeout(connect, 2000);
        }
      };

      // The server announces its planned end-of-stream so we don't flash "reconnecting".
      source.addEventListener('bye', () => {
        plannedEnd = true;
      });

      source.addEventListener('state', (e) => {
        const s = JSON.parse(e.data);
        setPullState({
          activePull: s.activePull,
          lastCompletedPull: s.lastCompletedPull,
          lastFailedPull: s.lastFailedPull,
        });
        if (!loadedOnce.current || s.maxSeq > maxSeq.current) sync();
      });

      for (const type of PULL_EVENTS) {
        source.addEventListener(type, (e) => {
          const { pull } = JSON.parse(e.data);
          setPullState((s) => {
            if (type === 'pull_completed') {
              return { activePull: null, lastCompletedPull: pull, lastFailedPull: null };
            }
            if (type === 'pull_failed') return { ...s, activePull: null, lastFailedPull: pull };
            return { ...s, activePull: pull };
          });
          if (type === 'pull_completed') sync();
        });
      }
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [sync]);

  return { trades, loaded, connection, freshFromSeq, ...pullState };
}
