import crypto from 'node:crypto';

/** HMAC-SHA256 signature for webhook bodies, e.g. "sha256=ab12...". */
export function sign(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/** Constant-time check of a received signature against the raw body. */
export function verify(secret, body, signature) {
  if (!signature) return false;
  const expected = Buffer.from(sign(secret, body));
  const received = Buffer.from(String(signature));
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
