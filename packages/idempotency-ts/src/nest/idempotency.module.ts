import { type DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { DynamoIdempotencyStore } from '../stores/dynamodb';
import type { IdempotencyStore } from '../types';
import { IdempotencyInterceptor, type IdempotencyInterceptorOptions } from './interceptor';
import { IDEMPOTENCY_OPTIONS, IDEMPOTENCY_STORE } from './tokens';

export interface IdempotencyModuleOptions extends IdempotencyInterceptorOptions {
  /** Service name, used as DynamoDB key prefix (`<service>#<key>`), e.g. `social-service`. */
  service: string;
  /** Provide an already built store (in-memory for tests)... */
  store?: IdempotencyStore;
  /** ...or a DynamoDB document client (DynamoDB Local or AWS). */
  client?: DynamoDBDocumentClient;
  /** Default `bandada-idempotency`. */
  tableName?: string;
  ttlSeconds?: number;
  lockSeconds?: number;
}

@Module({})
export class IdempotencyModule {
  static forRoot(options: IdempotencyModuleOptions): DynamicModule {
    const store =
      options.store ??
      (options.client
        ? new DynamoIdempotencyStore({
            client: options.client,
            service: options.service,
            tableName: options.tableName,
            ttlSeconds: options.ttlSeconds,
            lockSeconds: options.lockSeconds,
          })
        : undefined);
    if (!store) throw new Error('IdempotencyModule.forRoot requires either `store` or `client`');
    return {
      module: IdempotencyModule,
      global: true,
      providers: [
        Reflector,
        { provide: IDEMPOTENCY_STORE, useValue: store },
        { provide: IDEMPOTENCY_OPTIONS, useValue: { getPrincipal: options.getPrincipal, mapError: options.mapError, onOutcome: options.onOutcome } },
        IdempotencyInterceptor,
      ],
      exports: [IDEMPOTENCY_STORE, IDEMPOTENCY_OPTIONS, IdempotencyInterceptor],
    };
  }
}
