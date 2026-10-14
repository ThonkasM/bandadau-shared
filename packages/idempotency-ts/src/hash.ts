import { createHash } from 'node:crypto';

function compareCodePoints(a: string, b: string): number {
  const ca = Array.from(a, (c) => c.codePointAt(0) as number);
  const cb = Array.from(b, (c) => c.codePointAt(0) as number);
  for (let i = 0; i < Math.min(ca.length, cb.length); i += 1) {
    const d = (ca[i] as number) - (cb[i] as number);
    if (d !== 0) return d;
  }
  return ca.length - cb.length;
}

/** Canonical JSON: object keys sorted by Unicode code point (recursively), arrays keep order, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? '';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => compareCodePoints(a, b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function canonicalParams(params: Record<string, unknown> | undefined): string {
  return Object.entries(params ?? {})
    .sort(([a], [b]) => compareCodePoints(a, b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('&');
}

export interface HashInput {
  method: string;
  /** Route template, not the concrete URL. */
  routeTemplate: string;
  params?: Record<string, unknown>;
  principal: string;
  /** Parsed JSON body; undefined/null/'' hash as the empty string. */
  body?: unknown;
}

/** SHA-256 hex over METHOD, route template, path params, principal and canonical body (idempotencia.md 2.3). */
export function hashRequest(input: HashInput): string {
  const body = input.body === undefined || input.body === null || input.body === '' ? '' : canonicalJson(input.body);
  const material = [input.method.toUpperCase(), input.routeTemplate, canonicalParams(input.params), input.principal, body].join('\n');
  return createHash('sha256').update(material, 'utf8').digest('hex');
}
