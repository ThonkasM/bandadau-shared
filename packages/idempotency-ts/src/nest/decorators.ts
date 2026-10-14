import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';

import { IdempotencyInterceptor } from './interceptor';
import { IDEMPOTENT_KEY } from './tokens';

/** Enforces `Idempotency-Key` on the handler (400/409/422 per idempotencia.md) and replays stored responses. */
export const Idempotent = () => applyDecorators(SetMetadata(IDEMPOTENT_KEY, true), UseInterceptors(IdempotencyInterceptor));
