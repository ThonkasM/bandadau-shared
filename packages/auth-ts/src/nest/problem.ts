import { HttpException } from '@nestjs/common';

import { AuthError, authErrorToProblem } from '../errors';

/** HttpException whose body is a Problem Details object (`code` = UNAUTHORIZED | FORBIDDEN | ...). */
export class AuthProblemException extends HttpException {
  constructor(error: AuthError) {
    super(authErrorToProblem(error), error.status, { cause: error });
  }
}

export function toHttpException(error: unknown): unknown {
  return error instanceof AuthError ? new AuthProblemException(error) : error;
}
