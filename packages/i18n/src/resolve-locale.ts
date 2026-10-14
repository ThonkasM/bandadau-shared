import { DEFAULT_LOCALE, isLocale, type Locale } from './config';

export interface ResolveLocaleInput {
  /** `User.locale` when there is a session. */
  userLocale?: string | null;
  /** Choice stored on the device (`bandada.locale`). */
  storedLocale?: string | null;
  /** Browser/device languages in priority order (`navigator.languages`, `getLocales().map(l => l.languageTag)`). */
  systemLocales?: readonly string[] | null;
}

/** Maps `es`, `es-BO`, `es_MX`, `EN-us`... to a supported locale, or `undefined`. */
export function normalizeLocale(tag: string | null | undefined): Locale | undefined {
  if (!tag) return undefined;
  const language = tag.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(language) ? language : undefined;
}

/** i18n.md section 2: user locale, then stored choice, then device language, then `es`. */
export function resolveLocale(input: ResolveLocaleInput = {}): Locale {
  const direct = normalizeLocale(input.userLocale) ?? normalizeLocale(input.storedLocale);
  if (direct) return direct;
  for (const tag of input.systemLocales ?? []) {
    const match = normalizeLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/** Resolves the locale from an `Accept-Language` header value (server side). */
export function resolveLocaleFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const tags = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => /^\s*q=([\d.]+)/.exec(p)?.[1]).find(Boolean);
      return { tag: tag.trim(), q: q === undefined ? 1 : Number(q) };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
  return resolveLocale({ systemLocales: tags });
}
