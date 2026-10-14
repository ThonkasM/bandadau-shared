import { byteLength, DEFAULT_LOCK_SECONDS, DEFAULT_TTL_SECONDS, type IdempotencyStore, MAX_RESPONSE_BODY_BYTES,type ReserveInput, type ReserveOutcome, type StoredResponse } from '../types';

interface Entry {
  status: 'IN_PROGRESS' | 'COMPLETED';
  requestHash: string;
  principal: string;
  lockExpiresAt: number;
  expiresAt: number;
  response?: StoredResponse;
  responseTooLarge?: boolean;
}

export interface MemoryStoreOptions {
  service: string;
  ttlSeconds?: number;
  lockSeconds?: number;
  now?: () => number;
}

/** In-memory adapter with the same semantics as the DynamoDB one (for unit tests of services). */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly items = new Map<string, Entry>();
  private readonly ttl: number;
  private readonly lock: number;
  private readonly now: () => number;

  constructor(private readonly options: MemoryStoreOptions) {
    this.ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.lock = options.lockSeconds ?? DEFAULT_LOCK_SECONDS;
    this.now = options.now ?? Date.now;
  }

  private pk(key: string): string {
    return `${this.options.service}#${key}`;
  }

  async reserve(input: ReserveInput): Promise<ReserveOutcome> {
    const nowS = Math.floor(this.now() / 1000);
    const pk = this.pk(input.key);
    const existing = this.items.get(pk);
    if (!existing || existing.expiresAt < nowS) {
      this.items.set(pk, {
        status: 'IN_PROGRESS',
        requestHash: input.requestHash,
        principal: input.principal,
        lockExpiresAt: nowS + this.lock,
        expiresAt: nowS + this.ttl,
      });
      return { kind: 'reserved', orphanTakeover: false };
    }
    if (existing.requestHash !== input.requestHash || existing.principal !== input.principal) return { kind: 'key_reused' };
    if (existing.status === 'COMPLETED') {
      if (existing.responseTooLarge || !existing.response) return { kind: 'response_unavailable' };
      return { kind: 'replay', response: structuredClone(existing.response) };
    }
    if (existing.lockExpiresAt < nowS) {
      existing.lockExpiresAt = nowS + this.lock;
      return { kind: 'reserved', orphanTakeover: true };
    }
    return { kind: 'in_progress' };
  }

  async complete(key: string, response: StoredResponse): Promise<void> {
    const item = this.items.get(this.pk(key));
    if (!item || item.status !== 'IN_PROGRESS') return;
    item.status = 'COMPLETED';
    if (response.body !== undefined && byteLength(response.body) > MAX_RESPONSE_BODY_BYTES) {
      item.responseTooLarge = true;
      item.response = undefined;
    } else {
      item.response = structuredClone(response);
    }
  }

  async release(key: string): Promise<void> {
    const item = this.items.get(this.pk(key));
    if (item?.status === 'IN_PROGRESS') this.items.delete(this.pk(key));
  }

  /** Test helpers. */
  size(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }
}
