import { describe, expect, it } from 'vitest';

import { formatCredits, formatDate, formatDateTime, formatNumber, formatRelative } from '../src/format';

const norm = (s: string) => s.replace(/[  ]/g, ' ');

describe('format', () => {
  it('formats credits with plural', () => {
    expect(norm(formatCredits(1500, 'es'))).toBe('1.500 créditos');
    expect(norm(formatCredits(1500, 'en'))).toBe('1,500 credits');
    expect(formatCredits(1, 'es')).toBe('1 crédito');
    expect(formatCredits(1, 'en')).toBe('1 credit');
    expect(formatCredits(0, 'es')).toBe('0 créditos');
  });

  it('formats numbers by locale', () => {
    expect(norm(formatNumber(1234.5, 'es'))).toBe('1.234,5');
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
  });

  it('formats date-times in America/La_Paz (UTC-4)', () => {
    // 22:30Z is 18:30 in La Paz
    expect(norm(formatDateTime('2026-10-14T22:30:00Z', 'es'))).toBe('14 oct 2026, 18:30');
    expect(norm(formatDateTime('2026-10-14T22:30:00Z', 'en'))).toBe('Oct 14, 2026, 6:30 PM');
  });

  it('uses the La Paz day, not the UTC day', () => {
    expect(formatDate('2026-10-15T01:00:00Z', 'es')).toBe('14 oct 2026');
  });

  it('formats relative time', () => {
    const now = new Date('2026-10-14T12:00:00Z');
    expect(formatRelative(new Date('2026-10-14T11:55:00Z'), 'es', now)).toBe('hace 5 min');
    expect(norm(formatRelative(new Date('2026-10-14T11:55:00Z'), 'en', now))).toMatch(/^5 min\.? ago$/);
    expect(formatRelative(new Date('2026-10-15T12:00:00Z'), 'es', now)).toBe('mañana');
    expect(formatRelative(new Date('2026-10-14T15:00:00Z'), 'en', now)).toMatch(/in 3 hr\.?/);
  });

  it('rejects invalid dates', () => {
    expect(() => formatDate('nope', 'es')).toThrow(RangeError);
  });
});
