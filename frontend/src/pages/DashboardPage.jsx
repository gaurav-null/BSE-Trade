import { useState } from 'react';
import Header from '../components/Header.jsx';
import StatsRow from '../components/StatsRow.jsx';
import StatusPanel from '../components/StatusPanel.jsx';
import TradesTable from '../components/TradesTable.jsx';
import { useTradeFeed } from '../hooks/useTradeFeed.js';
import { resumePull, startPull } from '../services/api.js';

export default function DashboardPage() {
  const feed = useTradeFeed();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  async function run(action) {
    setBusy(true);
    setActionError(null);
    try {
      const { ok, body } = await action();
      // 409 just means "already running" - the live feed shows it, nothing to report.
      if (!ok && body.error !== 'pull_in_progress') setActionError(body.error ?? 'Request failed');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <Header connection={feed.connection} />

      <StatusPanel
        activePull={feed.activePull}
        lastCompletedPull={feed.lastCompletedPull}
        lastFailedPull={feed.lastFailedPull}
        tradeCount={feed.trades.length}
        busy={busy}
        error={actionError}
        onPull={() => run(startPull)}
        onResume={(id) => run(() => resumePull(id))}
      />

      <StatsRow trades={feed.trades} />

      {!feed.loaded ? (
        <div className="panel empty">Loading trades…</div>
      ) : (
        <TradesTable trades={feed.trades} freshFromSeq={feed.freshFromSeq} activePull={feed.activePull} />
      )}
    </div>
  );
}
