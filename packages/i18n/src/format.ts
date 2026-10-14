import { INTL_LOCALES, TIME_ZONE, type Locale } from './config';

export type DateInput = Date | string | number;
export type DateStyle = 'short' | 'medium' | 'long';

const CREDIT_WORDS: Record<Locale, { one: string; other: string }> = {
  es: { one: 'crédito', other: 'créditos' },
  en: { one: 'credit', other: 'credits' },
};

function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`);
  return date;
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALES[locale], { useGrouping: true, ...options }).format(value);
}

/** `formatCredits(1500, 'es')` is "1.500 créditos"; `'en'` is "1,500 credits". */
export function formatCredits(value: number, locale: Locale): string {
  const category = new Intl.PluralRules(INTL_LOCALES[locale]).select(value);
  const words = CREDIT_WORDS[locale];
  return `${formatNumber(value, locale, { maximumFractionDigits: 0 })} ${category === 'one' ? words.one : words.other}`;
}

// Component options (not dateStyle) so es prints "14 oct 2026, 18:30" and en "Oct 14, 2026, 6:30 PM".
function dateOptions(style: DateStyle): Intl.DateTimeFormatOptions {
  if (style === 'short') return { day: '2-digit', month: '2-digit', year: 'numeric' };
  return { day: 'numeric', month: style === 'long' ? 'long' : 'short', year: 'numeric' };
}

export function formatDate(value: DateInput, locale: Locale, style: DateStyle = 'medium'): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], { ...dateOptions(style), timeZone: TIME_ZONE }).format(toDate(value));
}

export function formatDateTime(value: DateInput, locale: Locale, style: DateStyle = 'medium'): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    ...dateOptions(style),
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: locale === 'es' ? 'h23' : 'h12',
    timeZone: TIME_ZONE,
  }).format(toDate(value));
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

/** "hace 5 min" / "5 min. ago". `now` is injectable for tests. */
export function formatRelative(
  value: DateInput,
  locale: Locale,
  now: DateInput = Date.now(),
  style: Intl.RelativeTimeFormatStyle = 'short',
): string {
  const diffSeconds = Math.round((toDate(value).getTime() - toDate(now).getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALES[locale], { numeric: 'auto', style });
  const [unit, size] = UNITS.find(([, s]) => abs >= s) ?? (['second', 1] as const);
  return rtf.format(Math.trunc(diffSeconds / size), unit);
}
