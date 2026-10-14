export type AuthErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'SERVICE_UNAVAILABLE' | 'INVALID_CLIENT';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly status: number,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AuthError';
  }

  static unauthorized(message = 'Missing or invalid access token', cause?: unknown): AuthError {
    return new AuthError('UNAUTHORIZED', 401, message, { cause });
  }

  static forbidden(message = 'Insufficient permissions'): AuthError {
    return new AuthError('FORBIDDEN', 403, message);
  }
}

/** Problem Details body (RFC 9457) for an AuthError. */
export function authErrorToProblem(error: AuthError, instance?: string) {
  const slug = error.code.toLowerCase().replace(/_/g, '-');
  return {
    type: `https://api.bandadau.com/problems/${slug}`,
    title: error.code === 'FORBIDDEN' ? 'Forbidden' : error.code === 'UNAUTHORIZED' ? 'Unauthenticated' : 'Authentication error',
    status: error.status,
    code: error.code,
    detail: error.message,
    ...(instance ? { instance } : {}),
  };
}
