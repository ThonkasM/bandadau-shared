import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../src/config';
import { normalizeLocale, resolveLocale, resolveLocaleFromAcceptLanguage } from '../src/resolve-locale';

describe('resolveLocale', () => {
  it('config', () => {
    expect(SUPPORTED_LOCALES).toEqual(['es', 'en']);
    expect(DEFAULT_LOCALE).toBe('es');
  });
  it('user locale wins', () => {
    expect(resolveLocale({ userLocale: 'en', storedLocale: 'es', systemLocales: ['es-BO'] })).toBe('en');
  });
  it('stored choice beats the device', () => {
    expect(resolveLocale({ storedLocale: 'en', systemLocales: ['es-BO'] })).toBe('en');
  });
  it('uses the first supported device language', () => {
    expect(resolveLocale({ systemLocales: ['fr-FR', 'en-GB', 'es'] })).toBe('en');
  });
  it('falls back to es', () => {
    expect(resolveLocale({ systemLocales: ['fr-FR'] })).toBe('es');
    expect(resolveLocale()).toBe('es');
    expect(resolveLocale({ userLocale: 'xx' })).toBe('es');
  });
  it('normalizes tags', () => {
    expect(normalizeLocale('es_MX')).toBe('es');
    expect(normalizeLocale('EN-us')).toBe('en');
    expect(normalizeLocale('de')).toBeUndefined();
  });
  it('parses Accept-Language with quality values', () => {
    expect(resolveLocaleFromAcceptLanguage('fr;q=0.9, en;q=0.8, es;q=0.4')).toBe('en');
    expect(resolveLocaleFromAcceptLanguage('es-BO,es;q=0.9,en;q=0.8')).toBe('es');
    expect(resolveLocaleFromAcceptLanguage(undefined)).toBe('es');
  });
});
