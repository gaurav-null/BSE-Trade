export function errorHandler(err, _req, res, _next) {
  console.error('[api] unhandled error', err);
  res.status(500).json({ error: 'internal_error' });
}
