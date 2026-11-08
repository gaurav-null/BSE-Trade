import { config } from '../config/index.js';

async function request(path) {
  const res = await fetch(config.bseUrl + path, { signal: AbortSignal.timeout(config.bseTimeoutMs) });
  if (!res.ok) {
    const err = new Error(`BSE responded ${res.status} for ${path.split('?')[0]}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const bseClient = {
  /** Ask the BSE to start a pull. Returns immediately with a job. */
  createJob: (callbackUrl) => request(`/getTrades?callbackUrl=${encodeURIComponent(callbackUrl)}`),
  getJob: (jobId) => request(`/getTrades/${jobId}`),
  getResults: (jobId, cursor, limit) => request(`/getTrades/${jobId}/results?cursor=${cursor}&limit=${limit}`),
};
