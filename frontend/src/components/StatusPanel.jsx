import { fmtDateTime, fmtInt, fmtTime } from '../utils/format.js';

const STEPS = ['Requested', 'BSE preparing data', 'Importing trades', 'Done'];
const STEP_INDEX = { starting: 0, pending: 1, ingesting: 2, stalled: 2, completed: 3 };

function Stepper({ pull }) {
  const current = STEP_INDEX[pull.status] ?? 0;
  return (
    <ol className="stepper">
      {STEPS.map((label, i) => (
        <li key={label} className={i < current ? 'done' : i === current ? 'current' : ''}>
          <span className="dot" />
          {label}
        </li>
      ))}
    </ol>
  );
}

function ActivePull({ pull, onResume, busy }) {
  const importing = pull.status === 'ingesting' || pull.status === 'stalled';
  const pct = pull.totalRecords ? Math.round((pull.fetched / pull.totalRecords) * 100) : 0;

  return (
    <>
      <div className="status-head">
        <strong>Pull #{pull.id} in progress</strong>
        <span className="muted">
          requested {fmtTime(pull.requestedAt)}
          {pull.eta && pull.status === 'pending' ? ` · BSE expects it ready around ${fmtTime(pull.eta)}` : ''}
        </span>
      </div>
      <Stepper pull={pull} />
      <div className={`bar ${importing ? '' : 'indeterminate'}`} aria-label="Pull progress">
        <div style={importing ? { width: `${pct}%` } : undefined} />
      </div>
      {importing && (
        <p className="muted small">
          {fmtInt(pull.fetched)} / {fmtInt(pull.totalRecords ?? 0)} records imported
        </p>
      )}
      {pull.status === 'stalled' && (
        <p className="error small">
          Import stalled: {pull.error}{' '}
          <button className="link" disabled={busy} onClick={() => onResume(pull.id)}>
            Resume
          </button>
        </p>
      )}
      <p className="muted small">

      </p>
    </>
  );
}

export default function StatusPanel({
  activePull,
  lastCompletedPull,
  lastFailedPull,
  tradeCount,
  busy,
  error,
  onPull,
  onResume,
}) {
  return (
    <section className="panel status">
      <div className="status-main">
        {activePull ? (
          <ActivePull pull={activePull} onResume={onResume} busy={busy} />
        ) : lastCompletedPull ? (
          <>
            <div className="status-head">
              <strong>Up to date</strong>
              <span className="muted">
                Pull #{lastCompletedPull.id} completed {fmtDateTime(lastCompletedPull.completedAt)}
              </span>
            </div>
            <p className="muted small">
              {fmtInt(lastCompletedPull.inserted)} new trades in the last pull · {fmtInt(tradeCount)} total
            </p>
          </>
        ) : (
          <>
            <div className="status-head">
              <strong>No data yet</strong>
            </div>
            <p className="muted small">Start a pull to fetch trades from the BSE.</p>
          </>
        )}
        {lastFailedPull && !activePull && (
          <p className="error small">
            Pull #{lastFailedPull.id} failed: {lastFailedPull.error}
          </p>
        )}
        {error && <p className="error small">{error}</p>}
      </div>

      <button className="primary" onClick={onPull} disabled={busy || Boolean(activePull)}>
        {activePull ? 'Pull running…' : 'Pull now'}
      </button>
    </section>
  );
}
