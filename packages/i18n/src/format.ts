import { INTL_LOCALES, type Locale,TIME_ZONE } from './config';

export type DateInput = Date | string | number;
export type DateStyle = 'short' | 'medium' | 'long';

const CREDIT_WORDS: Record<Locale, { one: string; other: string }> = {
  es: { one: 'crédito', other: 'créditos' },
  en: { one: 'credit', other: 'credits' },
};

/**
 * Hermes (React Native) does not implement every `Intl` constructor — e.g.
 * `Intl.RelativeTimeFormat` is missing and `new Intl.RelativeTimeFormat()` throws
 * "undefined cannot be used as a constructor". These guards fall back to simple
 * formatting so helpers never crash on native.
 */
function hasIntl(
  name: 'NumberFormat' | 'PluralRules' | 'DateTimeFormat' | 'RelativeTimeFormat',
): boolean {
  return (
    typeof Intl !== 'undefined' &&
    typeof (Intl as unknown as Record<string, unknown>)[name] === 'function'
  );
}

function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`);
  return date;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  if (!hasIntl('NumberFormat')) return String(value);
  return new Intl.NumberFormat(INTL_LOCALES[locale], { useGrouping: true, ...options }).format(value);
}

/** `formatCredits(1500, 'es')` is "1.500 créditos"; `'en'` is "1,500 credits". */
export function formatCredits(value: number, locale: Locale): string {
  const words = CREDIT_WORDS[locale];
  const category = hasIntl('PluralRules')
    ? new Intl.PluralRules(INTL_LOCALES[locale]).select(value)
    : value === 1
      ? 'one'
      : 'other';
  return `${formatNumber(value, locale, { maximumFractionDigits: 0 })} ${category === 'one' ? words.one : words.other}`;
}

// Component options (not dateStyle) so es prints "14 oct 2026, 18:30" and en "Oct 14, 2026, 6:30 PM".
function dateOptions(style: DateStyle): Intl.DateTimeFormatOptions {
  if (style === 'short') return { day: '2-digit', month: '2-digit', year: 'numeric' };
  return { day: 'numeric', month: style === 'long' ? 'long' : 'short', year: 'numeric' };
}

export function formatDate(value: DateInput, locale: Locale, style: DateStyle = 'medium'): string {
  const date = toDate(value);
  if (!hasIntl('DateTimeFormat')) return isoDate(date);
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    ...dateOptions(style),
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatDateTime(value: DateInput, locale: Locale, style: DateStyle = 'medium'): string {
  const date = toDate(value);
  if (!hasIntl('DateTimeFormat')) return date.toISOString().slice(0, 16).replace('T', ' ');
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    ...dateOptions(style),
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: locale === 'es' ? 'h23' : 'h12',
    timeZone: TIME_ZONE,
  }).format(date);
}

const UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

const RELATIVE_UNIT_LABELS: Record<Locale, Record<string, string>> = {
  es: { year: 'a', month: 'mes', week: 'sem', day: 'd', hour: 'h', minute: 'min', second: 's' },
  en: { year: 'y', month: 'mo', week: 'w', day: 'd', hour: 'h', minute: 'min', second: 's' },
};

function fallbackRelative(amount: number, unit: string, locale: Locale): string {
  const label = RELATIVE_UNIT_LABELS[locale][unit] ?? unit;
  const n = Math.abs(amount);
  if (amount < 0) return locale === 'es' ? `hace ${n} ${label}` : `${n} ${label} ago`;
  return locale === 'es' ? `en ${n} ${label}` : `in ${n} ${label}`;
}

/** "hace 5 min" / "5 min. ago". `now` is injectable for tests. */
export function formatRelative(
  value: DateInput,
  locale: Locale,
  now: DateInput = Date.now(),
  style: Intl.RelativeTimeFormatStyle = 'short',
): string {
  const diffSeconds = Math.round((toDate(value).getTime() - toDate(now).getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  const [unit, size] = UNITS.find(([, s]) => abs >= s) ?? (['second', 1] as const);
  const amount = Math.trunc(diffSeconds / size);

  if (!hasIntl('RelativeTimeFormat')) return fallbackRelative(amount, unit, locale);

  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALES[locale], { numeric: 'auto', style });
  return rtf.format(amount, unit);
}
