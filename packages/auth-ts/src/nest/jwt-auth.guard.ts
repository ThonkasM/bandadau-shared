import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { extractBearerToken } from '../bearer';
import type { JwtVerifier } from '../jwt-verifier';
import { type RequestWithPrincipal } from './decorators';
import { toHttpException } from './problem';
import { IS_PUBLIC_KEY, USER_JWT_VERIFIER } from './tokens';

/** Validates `Authorization: Bearer <jwt>` and sets `request.user`. Honors `@Public()`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(USER_JWT_VERIFIER) private readonly verifier: JwtVerifier,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    try {
      request.user = await this.verifier.verify(extractBearerToken(request.headers.authorization));
    } catch (error) {
      throw toHttpException(error);
    }
    return true;
  }
}
