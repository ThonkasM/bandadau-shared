export const ROLES = ['STUDENT', 'ORGANIZER', 'MODERATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];
export type TokenType = 'user' | 'service';

export const AUDIENCES = { app: 'bandada-app', admin: 'bandada-admin', internal: 'bandada-internal' } as const;

export interface AuthPrincipal {
  /** UUIDv7 of the user, or `service:<name>` for service tokens. */
  sub: string;
  typ: TokenType;
  roles: Role[];
  scopes: string[];
  universityId?: string;
  locale?: 'es' | 'en';
  jti?: string;
  aud: string[];
  exp: number;
}

const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

export function hasAnyRole(principal: Pick<AuthPrincipal, 'roles'>, required: readonly Role[]): boolean {
  return required.length === 0 || required.some((r) => principal.roles.includes(r));
}

export function hasAllScopes(principal: Pick<AuthPrincipal, 'scopes'>, required: readonly string[]): boolean {
  return required.every((s) => principal.scopes.includes(s));
}

export function principalFromClaims(claims: Record<string, unknown>): AuthPrincipal | null {
  const { sub, typ, roles, scope, uni, locale, jti, aud, exp } = claims;
  if (typeof sub !== 'string' || sub === '') return null;
  if (typ !== 'user' && typ !== 'service') return null;
  if (typeof exp !== 'number') return null;
  const rolesArray = Array.isArray(roles) ? roles : roles === undefined ? [] : null;
  if (rolesArray === null) return null;
  return {
    sub,
    typ,
    roles: rolesArray.filter(isRole),
    scopes: typeof scope === 'string' ? scope.split(' ').filter(Boolean) : Array.isArray(scope) ? scope.map(String) : [],
    universityId: typeof uni === 'string' ? uni : undefined,
    locale: locale === 'es' || locale === 'en' ? locale : undefined,
    jti: typeof jti === 'string' ? jti : undefined,
    aud: Array.isArray(aud) ? aud.map(String) : typeof aud === 'string' ? [aud] : [],
    exp,
  };
}
