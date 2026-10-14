import { applyDecorators, createParamDecorator, type ExecutionContext, SetMetadata, UseGuards } from '@nestjs/common';

import type { AuthPrincipal, Role } from '../principal';
import { ServiceAuthGuard } from './service-auth.guard';
import { IS_PUBLIC_KEY, ROLES_KEY, SCOPES_KEY } from './tokens';

/** Skips `JwtAuthGuard` (use when the guard is registered globally with APP_GUARD). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires at least one of the roles (`RolesGuard`). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Requires all the scopes (`ServiceAuthGuard`, token `scope` claim). */
export const RequireScopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);

export interface RequestWithPrincipal {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthPrincipal;
}

/** Injects the authenticated principal (or one of its fields) set by the guards. */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthPrincipal | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<RequestWithPrincipal>();
    return field ? request.user?.[field] : request.user;
  },
);

/** Marks a controller/handler as `/internal/v1`: bypasses the user guard and requires a service token with the scopes. */
export const Internal = (...scopes: string[]) =>
  applyDecorators(Public(), RequireScopes(...scopes), UseGuards(ServiceAuthGuard));
