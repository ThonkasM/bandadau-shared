import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthError } from '../errors';
import { hasAnyRole, type Role } from '../principal';
import { type RequestWithPrincipal } from './decorators';
import { toHttpException } from './problem';
import { IS_PUBLIC_KEY, ROLES_KEY } from './tokens';

/** Enforces `@Roles(...)`. Must run after `JwtAuthGuard`. Handlers without `@Roles` pass. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest<RequestWithPrincipal>().user;
    if (!user) throw toHttpException(AuthError.unauthorized());
    if (!hasAnyRole(user, required)) throw toHttpException(AuthError.forbidden());
    return true;
  }
}
