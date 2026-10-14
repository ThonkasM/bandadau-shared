export const SUPPORTED_LOCALES = ['es', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';
export const FALLBACK_LOCALE: Locale = 'es';

/** BCP 47 tag used with Intl for each supported locale. */
export const INTL_LOCALES: Readonly<Record<Locale, string>> = { es: 'es-BO', en: 'en-US' };

export const TIME_ZONE = 'America/La_Paz';
export const LOCALE_STORAGE_KEY = 'bandada.locale';

export const NAMESPACES = ['common', 'enums', 'errors'] as const;
export type Namespace = (typeof NAMESPACES)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
