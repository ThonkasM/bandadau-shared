export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';
export const DEFAULT_TTL_SECONDS = 86_400;
export const DEFAULT_LOCK_SECONDS = 30;
export const MAX_RESPONSE_BODY_BYTES = 300 * 1024;
/** Headers replayed from the stored response (never Set-Cookie). */
export const REPLAYED_HEADERS = ['Content-Type', 'Location', 'Content-Language'] as const;

export interface StoredResponse {
  status: number;
  headers: Record<string, string>;
  /** JSON-serialized body, or undefined for empty responses. */
  body?: string;
}

export interface ReserveInput {
  /** The client `Idempotency-Key` (UUID). */
  key: string;
  requestHash: string;
  /** JWT `sub` or `anonymous`. */
  principal: string;
  method: string;
  /** Route template, e.g. `/api/v1/events/{eventId}/registrations`. */
  path: string;
}

export type ReserveOutcome =
  | { kind: 'reserved'; orphanTakeover: boolean }
  | { kind: 'replay'; response: StoredResponse }
  | { kind: 'in_progress' }
  | { kind: 'key_reused' }
  | { kind: 'response_unavailable' };

/** Port. Each service only touches its own `<service>#` prefix. */
export interface IdempotencyStore {
  reserve(input: ReserveInput): Promise<ReserveOutcome>;
  /** IN_PROGRESS -> COMPLETED with the response to replay. */
  complete(key: string, response: StoredResponse): Promise<void>;
  /** Deletes an IN_PROGRESS record so the client can retry with the same key. */
  release(key: string): Promise<void>;
}

/** 2xx and deterministic 4xx are stored; 401/403/429 and 5xx release the key. */
export function isStorableStatus(status: number): boolean {
  return (status >= 200 && status < 300) || [400, 404, 409, 422].includes(status);
}

export function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}
