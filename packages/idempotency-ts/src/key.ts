export type KeyProblemCode = 'IDEMPOTENCY_KEY_MISSING' | 'IDEMPOTENCY_KEY_INVALID';

const UUID_V4_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParsedKey = { ok: true; key: string } | { ok: false; code: KeyProblemCode };

/** Header must be present and a UUID v4 or v7 (idempotencia.md section 2.1). */
export function parseIdempotencyKey(header: string | string[] | undefined): ParsedKey {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || value.trim() === '') return { ok: false, code: 'IDEMPOTENCY_KEY_MISSING' };
  const key = value.trim();
  return UUID_V4_V7.test(key) ? { ok: true, key: key.toLowerCase() } : { ok: false, code: 'IDEMPOTENCY_KEY_INVALID' };
}
