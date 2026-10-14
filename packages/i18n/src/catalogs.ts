import enCommon from '../locales/en/common.json';
import enEnums from '../locales/en/enums.json';
import enErrors from '../locales/en/errors.json';
import esCommon from '../locales/es/common.json';
import esEnums from '../locales/es/enums.json';
import esErrors from '../locales/es/errors.json';
import type { Locale } from './config';

export const resources = {
  es: { common: esCommon, enums: esEnums, errors: esErrors },
  en: { common: enCommon, enums: enEnums, errors: enErrors },
} as const;

export type Resources = typeof resources;
export type ErrorCode = keyof (typeof resources)['es']['errors'];
export type EnumName = keyof (typeof resources)['es']['enums'];

export function hasErrorMessage(code: string): code is ErrorCode {
  return code in resources.es.errors;
}

/** i18n key for a Problem Details `code` (namespace `errors`). Falls back to INTERNAL_ERROR for unknown codes. */
export function errorKey(code: string | undefined): string {
  return code && hasErrorMessage(code) ? code : 'INTERNAL_ERROR';
}

/** Raw ICU message of an error code (use your i18n library to interpolate params). */
export function errorMessage(code: string | undefined, locale: Locale): string {
  return resources[locale].errors[errorKey(code) as ErrorCode];
}
