import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTVerifyGetKey } from 'jose';

import { AuthError } from './errors';
import { type AuthPrincipal, principalFromClaims, type TokenType } from './principal';

export interface JwtVerifierOptions {
  /** `JWKS_URL`, e.g. `http://identity-service:7001/.well-known/jwks.json`. */
  jwksUrl: string;
  /** Expected `iss`. */
  issuer: string;
  /** Accepted `aud` values (any of them). */
  audience: string | string[];
  /** Accepted `typ` claims. Default `['user']`. */
  allowedTypes?: TokenType[];
  /** `exp`/`nbf` tolerance in seconds. Default 30. */
  clockToleranceSec?: number;
  /** Minimum time between JWKS refetches triggered by an unknown `kid`. Default 30 000 ms. */
  jwksCooldownMs?: number;
  /** How long a fetched JWKS is considered fresh. Default 300 000 ms. */
  jwksCacheMaxAgeMs?: number;
  jwksTimeoutMs?: number;
  /** Replace the remote JWKS (tests, static keys). */
  keyResolver?: JWTVerifyGetKey;
}

export interface JwtVerifier {
  verify(token: string): Promise<AuthPrincipal>;
}

const CLIENT_ERRORS: Array<new (...args: never[]) => Error> = [
  joseErrors.JWTExpired,
  joseErrors.JWTClaimValidationFailed,
  joseErrors.JWTInvalid,
  joseErrors.JWSInvalid,
  joseErrors.JWSSignatureVerificationFailed,
  joseErrors.JOSEAlgNotAllowed,
  joseErrors.JOSENotSupported,
  joseErrors.JWKSNoMatchingKey,
  joseErrors.JWKSMultipleMatchingKeys,
  joseErrors.JWKInvalid,
];

/** Validates RS256 JWTs against the identity JWKS (cached; unknown `kid` triggers one throttled refetch). */
export function createJwtVerifier(options: JwtVerifierOptions): JwtVerifier {
  const getKey: JWTVerifyGetKey =
    options.keyResolver ??
    createRemoteJWKSet(new URL(options.jwksUrl), {
      cooldownDuration: options.jwksCooldownMs ?? 30_000,
      cacheMaxAge: options.jwksCacheMaxAgeMs ?? 300_000,
      timeoutDuration: options.jwksTimeoutMs ?? 5_000,
    });
  const allowed = options.allowedTypes ?? ['user'];

  return {
    async verify(token: string): Promise<AuthPrincipal> {
      let payload: Record<string, unknown>;
      try {
        ({ payload } = await jwtVerify(token, getKey, {
          issuer: options.issuer,
          audience: options.audience,
          algorithms: ['RS256'],
          clockTolerance: options.clockToleranceSec ?? 30,
        }));
      } catch (error) {
        if (CLIENT_ERRORS.some((E) => error instanceof E)) throw AuthError.unauthorized('Invalid access token', error);
        throw new AuthError('SERVICE_UNAVAILABLE', 503, 'Unable to validate the access token', { cause: error });
      }
      const principal = principalFromClaims(payload);
      if (!principal) throw AuthError.unauthorized('Malformed access token claims');
      if (!allowed.includes(principal.typ)) throw AuthError.unauthorized('Token type not accepted here');
      return principal;
    },
  };
}
