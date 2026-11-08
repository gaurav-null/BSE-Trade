export const pullView = (p) =>
  p
    ? {
        id: p.id,
        status: p.status,
        bseJobId: p.bse_job_id,
        requestedAt: p.requested_at,
        eta: p.eta,
        readyAt: p.ready_at,
        completedAt: p.completed_at,
        totalRecords: p.total_records,
        fetched: p.fetched,
        inserted: p.inserted,
        error: p.error,
      }
    : null;
