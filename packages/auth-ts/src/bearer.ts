import { AuthError } from './errors';

export function extractBearerToken(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  const match = value ? /^Bearer\s+(\S+)$/i.exec(value.trim()) : null;
  if (!match?.[1]) throw AuthError.unauthorized('Missing bearer token');
  return match[1];
}
