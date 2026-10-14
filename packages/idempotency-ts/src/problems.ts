export type IdempotencyProblemCode =
  | 'IDEMPOTENCY_KEY_MISSING'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_RESPONSE_UNAVAILABLE';

const SPEC: Record<IdempotencyProblemCode, { status: number; title: string; detail: string }> = {
  IDEMPOTENCY_KEY_MISSING: { status: 400, title: 'Idempotency-Key required', detail: 'This operation requires the Idempotency-Key header.' },
  IDEMPOTENCY_KEY_INVALID: { status: 400, title: 'Invalid Idempotency-Key', detail: 'Idempotency-Key must be a UUID (v4 or v7).' },
  IDEMPOTENCY_IN_PROGRESS: { status: 409, title: 'Request in progress', detail: 'A request with this Idempotency-Key is still being processed.' },
  IDEMPOTENCY_KEY_REUSED: { status: 422, title: 'Idempotency-Key reused', detail: 'This Idempotency-Key was already used with a different request.' },
  IDEMPOTENCY_RESPONSE_UNAVAILABLE: { status: 409, title: 'Original response unavailable', detail: 'The original response is too large to be replayed.' },
};

export function idempotencyProblem(code: IdempotencyProblemCode, instance?: string) {
  const s = SPEC[code];
  return {
    type: `https://api.bandadau.com/problems/${code.toLowerCase().replace(/_/g, '-')}`,
    title: s.title,
    status: s.status,
    detail: s.detail,
    code,
    ...(instance ? { instance } : {}),
  };
}
