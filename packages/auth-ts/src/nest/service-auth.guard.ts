import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { extractBearerToken } from '../bearer';
import { AuthError } from '../errors';
import type { JwtVerifier } from '../jwt-verifier';
import { hasAllScopes } from '../principal';
import { type RequestWithPrincipal } from './decorators';
import { toHttpException } from './problem';
import { SCOPES_KEY, SERVICE_JWT_VERIFIER } from './tokens';

/** Guard for `/internal/v1/**`: `aud = bandada-internal`, `typ = service`, scopes from `@RequireScopes(...)`. */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(
    @Inject(SERVICE_JWT_VERIFIER) private readonly verifier: JwtVerifier,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    try {
      const principal = await this.verifier.verify(extractBearerToken(request.headers.authorization));
      const required = this.reflector.getAllAndOverride<string[] | undefined>(SCOPES_KEY, [context.getHandler(), context.getClass()]) ?? [];
      if (!hasAllScopes(principal, required)) throw AuthError.forbidden('Missing required scope');
      request.user = principal;
    } catch (error) {
      throw toHttpException(error);
    }
    return true;
  }
}
