import { type CallHandler, type ExecutionContext, HttpException, Inject, Injectable, type NestInterceptor, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, from, mergeMap, type Observable, of, throwError } from 'rxjs';

import { hashRequest } from '../hash';
import { parseIdempotencyKey } from '../key';
import { idempotencyProblem } from '../problems';
import {
  type IdempotencyStore,
  IDEMPOTENT_REPLAYED_HEADER,
  isStorableStatus,
  REPLAYED_HEADERS,
  type StoredResponse,
} from '../types';
import { IDEMPOTENCY_OPTIONS, IDEMPOTENCY_STORE, IDEMPOTENT_KEY } from './tokens';

export type IdempotencyMetric = 'reserved' | 'replayed' | 'in_progress' | 'key_reused' | 'orphan_takeover' | 'response_unavailable';

export interface IdempotencyInterceptorOptions {
  /** JWT `sub`; default reads `request.user.sub` and falls back to `anonymous`. */
  getPrincipal?: (request: HttpRequestLike) => string | undefined;
  /** Maps non-HttpException domain errors to a storable response (otherwise the key is released). */
  mapError?: (error: unknown) => { status: number; body: unknown } | undefined;
  /** Hook for the `idempotency_replays_total{outcome}` metric. */
  onOutcome?: (outcome: IdempotencyMetric) => void;
}

export interface HttpRequestLike {
  method: string;
  url?: string;
  path?: string;
  headers: Record<string, string | string[] | undefined>;
  params?: Record<string, unknown>;
  body?: unknown;
  user?: { sub?: string };
  route?: { path?: string };
  routeOptions?: { url?: string };
  routerPath?: string;
}

export interface HttpResponseLike {
  statusCode: number;
  status?: (code: number) => unknown;
  setHeader?: (name: string, value: string) => unknown;
  header?: (name: string, value: string) => unknown;
  getHeader?: (name: string) => unknown;
  getHeaders?: () => Record<string, unknown>;
}

function routeTemplate(request: HttpRequestLike): string {
  const raw = request.route?.path ?? request.routeOptions?.url ?? request.routerPath ?? (request.path ?? request.url ?? '').split('?')[0] ?? '';
  return raw.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function setHeader(res: HttpResponseLike, name: string, value: string): void {
  if (typeof res.setHeader === 'function') res.setHeader(name, value);
  else if (typeof res.header === 'function') res.header(name, value);
}

function setStatus(res: HttpResponseLike, status: number): void {
  if (typeof res.status === 'function') res.status(status);
  else res.statusCode = status;
}

function captureHeaders(res: HttpResponseLike): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of REPLAYED_HEADERS) {
    const value = res.getHeader?.(name) ?? res.getHeader?.(name.toLowerCase());
    if (typeof value === 'string' && value !== '') out[name] = value;
  }
  return out;
}

/** Applies D3 (idempotencia.md section 2) to handlers decorated with `@Idempotent()`. */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Optional() @Inject(IDEMPOTENCY_OPTIONS) private readonly options: IdempotencyInterceptorOptions = {},
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const enabled = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [context.getHandler(), context.getClass()]);
    const http = context.switchToHttp();
    const req = http.getRequest<HttpRequestLike>();
    const res = http.getResponse<HttpResponseLike>();
    if (!enabled || ['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return next.handle();
    return from(this.run(req, res, next)).pipe(mergeMap((obs) => obs));
  }

  private async run(req: HttpRequestLike, res: HttpResponseLike, next: CallHandler): Promise<Observable<unknown>> {
    const instance = (req.path ?? req.url ?? '').split('?')[0];
    const parsed = parseIdempotencyKey(req.headers['idempotency-key']);
    if (!parsed.ok) throw new HttpException(idempotencyProblem(parsed.code, instance), 400);

    const principal = this.options.getPrincipal?.(req) ?? req.user?.sub ?? 'anonymous';
    const template = routeTemplate(req);
    const outcome = await this.store.reserve({
      key: parsed.key,
      principal,
      method: req.method.toUpperCase(),
      path: template,
      requestHash: hashRequest({ method: req.method, routeTemplate: template, params: req.params, principal, body: req.body }),
    });
    const emit = this.options.onOutcome;

    switch (outcome.kind) {
      case 'replay':
        emit?.('replayed');
        return this.replay(res, outcome.response);
      case 'in_progress': {
        emit?.('in_progress');
        setHeader(res, 'Retry-After', '1');
        throw new HttpException(idempotencyProblem('IDEMPOTENCY_IN_PROGRESS', instance), 409);
      }
      case 'key_reused':
        emit?.('key_reused');
        throw new HttpException(idempotencyProblem('IDEMPOTENCY_KEY_REUSED', instance), 422);
      case 'response_unavailable':
        emit?.('response_unavailable');
        throw new HttpException(idempotencyProblem('IDEMPOTENCY_RESPONSE_UNAVAILABLE', instance), 409);
      case 'reserved':
        emit?.(outcome.orphanTakeover ? 'orphan_takeover' : 'reserved');
    }

    const key = parsed.key;
    return next.handle().pipe(
      mergeMap(async (body) => {
        const status = res.statusCode;
        if (isStorableStatus(status)) {
          await this.store.complete(key, { status, headers: captureHeaders(res), body: serializeBody(body) });
        } else {
          await this.store.release(key);
        }
        return body;
      }),
      catchError((error: unknown) =>
        from(this.onError(key, error)).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }

  private async onError(key: string, error: unknown): Promise<void> {
    const mapped =
      error instanceof HttpException
        ? { status: error.getStatus(), body: error.getResponse() as unknown }
        : this.options.mapError?.(error);
    if (mapped && isStorableStatus(mapped.status)) {
      await this.store.complete(key, { status: mapped.status, headers: {}, body: serializeBody(mapped.body) });
    } else {
      await this.store.release(key);
    }
  }

  private replay(res: HttpResponseLike, stored: StoredResponse): Observable<unknown> {
    const body = stored.body === undefined ? undefined : (JSON.parse(stored.body) as unknown);
    if (stored.status >= 400) {
      setHeader(res, IDEMPOTENT_REPLAYED_HEADER, 'true');
      return throwError(() => new HttpException(body as string | Record<string, unknown>, stored.status));
    }
    setStatus(res, stored.status);
    for (const [name, value] of Object.entries(stored.headers)) setHeader(res, name, value);
    setHeader(res, IDEMPOTENT_REPLAYED_HEADER, 'true');
    return of(body);
  }
}

function serializeBody(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  return JSON.stringify(body);
}
