import { type DynamicModule, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { createJwtVerifier, type JwtVerifierOptions } from '../jwt-verifier';
import { AUDIENCES } from '../principal';
import { ServiceTokenProvider, type ServiceTokenProviderOptions } from '../service-token-provider';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { ServiceAuthGuard } from './service-auth.guard';
import { AUTH_OPTIONS, SERVICE_JWT_VERIFIER, SERVICE_TOKEN_PROVIDER, USER_JWT_VERIFIER } from './tokens';

export interface AuthModuleOptions {
  jwksUrl: string;
  issuer: string;
  /** Audiences accepted on `/api/v1`. Default `['bandada-app', 'bandada-admin']`. */
  audience?: string[];
  /** Audience accepted on `/internal/v1`. Default `bandada-internal`. */
  internalAudience?: string;
  /** Accept `typ=service` tokens in `JwtAuthGuard` (e.g. insights). Default false. */
  allowServiceTokensOnPublicApi?: boolean;
  clockToleranceSec?: number;
  jwksCooldownMs?: number;
  jwksCacheMaxAgeMs?: number;
  /** Set to enable `ServiceTokenProvider` injection (`SERVICE_TOKEN_PROVIDER`). */
  serviceToken?: ServiceTokenProviderOptions;
}

@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions): DynamicModule {
    const base: Pick<JwtVerifierOptions, 'jwksUrl' | 'issuer' | 'clockToleranceSec' | 'jwksCooldownMs' | 'jwksCacheMaxAgeMs'> = {
      jwksUrl: options.jwksUrl,
      issuer: options.issuer,
      clockToleranceSec: options.clockToleranceSec,
      jwksCooldownMs: options.jwksCooldownMs,
      jwksCacheMaxAgeMs: options.jwksCacheMaxAgeMs,
    };
    const providers: NonNullable<DynamicModule['providers']> = [
      { provide: AUTH_OPTIONS, useValue: options },
      Reflector,
      {
        provide: USER_JWT_VERIFIER,
        useValue: createJwtVerifier({
          ...base,
          audience: options.audience ?? [AUDIENCES.app, AUDIENCES.admin],
          allowedTypes: options.allowServiceTokensOnPublicApi ? ['user', 'service'] : ['user'],
        }),
      },
      {
        provide: SERVICE_JWT_VERIFIER,
        useValue: createJwtVerifier({ ...base, audience: options.internalAudience ?? AUDIENCES.internal, allowedTypes: ['service'] }),
      },
      JwtAuthGuard,
      RolesGuard,
      ServiceAuthGuard,
    ];
    if (options.serviceToken) {
      providers.push({ provide: SERVICE_TOKEN_PROVIDER, useValue: new ServiceTokenProvider(options.serviceToken) });
    }
    return {
      module: AuthModule,
      global: true,
      providers,
      exports: [USER_JWT_VERIFIER, SERVICE_JWT_VERIFIER, JwtAuthGuard, RolesGuard, ServiceAuthGuard, AUTH_OPTIONS, ...(options.serviceToken ? [SERVICE_TOKEN_PROVIDER] : [])],
    };
  }
}
