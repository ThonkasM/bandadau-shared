import { AuthError } from './errors';

export interface ServiceTokenProviderOptions {
  /** `identity-service` `/api/v1/auth/service-token` (internal network only). */
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  /** Requested scopes (`internal:read`, `internal:write`, `mcp:tools`...). */
  scopes?: string[];
  /** Refresh this many seconds before `exp`. Default 30. */
  refreshSkewSec?: number;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

/** Client-credentials token cache with single-flight refresh. */
export class ServiceTokenProvider {
  private cached: CachedToken | null = null;
  private inflight: Promise<CachedToken> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: ServiceTokenProviderOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async getToken(): Promise<string> {
    const skewMs = (this.options.refreshSkewSec ?? 30) * 1000;
    if (this.cached && this.cached.expiresAtMs - skewMs > this.now()) return this.cached.accessToken;
    this.inflight ??= this.fetchToken().finally(() => {
      this.inflight = null;
    });
    this.cached = await this.inflight;
    return this.cached.accessToken;
  }

  /** `{ Authorization: 'Bearer ...' }` ready to spread into request headers. */
  async authHeaders(extra?: { actorId?: string; correlationId?: string }): Promise<Record<string, string>> {
    const headers: Record<string, string> = { Authorization: `Bearer ${await this.getToken()}` };
    if (extra?.actorId) headers['X-Actor-Id'] = extra.actorId;
    if (extra?.correlationId) headers['X-Correlation-Id'] = extra.correlationId;
    return headers;
  }

  /** Drop the cached token (e.g. after a 401 from a downstream service). */
  invalidate(): void {
    this.cached = null;
  }

  private async fetchToken(): Promise<CachedToken> {
    const { tokenUrl, clientId, clientSecret, scopes, timeoutMs = 5000 } = this.options;
    let response: Response;
    try {
      response = await this.fetchImpl(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, ...(scopes ? { scopes } : {}) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw new AuthError('SERVICE_UNAVAILABLE', 503, 'Cannot reach the identity service for a service token', { cause });
    }
    if (response.status === 401 || response.status === 403) {
      throw new AuthError('INVALID_CLIENT', 401, 'Service credentials were rejected by identity');
    }
    if (!response.ok) {
      throw new AuthError('SERVICE_UNAVAILABLE', 503, `Identity responded ${response.status} to the service token request`);
    }
    const body = (await response.json()) as Record<string, unknown>;
    const accessToken = (body.accessToken ?? body.access_token) as unknown;
    const expiresIn = Number(body.expiresIn ?? body.expires_in ?? 300);
    if (typeof accessToken !== 'string' || !Number.isFinite(expiresIn)) {
      throw new AuthError('SERVICE_UNAVAILABLE', 503, 'Malformed service token response');
    }
    return { accessToken, expiresAtMs: this.now() + expiresIn * 1000 };
  }
}
