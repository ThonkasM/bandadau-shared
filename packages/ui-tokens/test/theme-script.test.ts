import { describe, expect, it } from 'vitest';

import { applyTheme, createThemeScript, resolveEffectiveTheme, themeScript } from '../src/index';

function run(script: string, stored: string | null, systemDark: boolean) {
  const attrs: Record<string, string> = {};
  const meta = { content: '', setAttribute(_: string, v: string) { this.content = v; } };
  const doc = {
    documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; }, style: { colorScheme: '' } },
    querySelectorAll: () => [meta],
  };
  const win = { matchMedia: () => ({ matches: systemDark }) };
  const storage = { getItem: () => stored };
  new Function('document', 'window', 'localStorage', script)(doc, win, storage);
  return { attrs, doc, meta };
}

describe('theme script', () => {
  it('follows the system when no preference is stored', () => {
    expect(run(themeScript, null, true).attrs['data-theme']).toBe('dark');
    expect(run(themeScript, 'SYSTEM', false).attrs['data-theme']).toBe('light');
  });
  it('explicit preference wins over system', () => {
    expect(run(themeScript, 'LIGHT', true).attrs['data-theme']).toBe('light');
    expect(run(themeScript, 'DARK', false).attrs['data-theme']).toBe('dark');
  });
  it('sets color-scheme and theme-color', () => {
    const { doc, meta } = run(themeScript, 'DARK', false);
    expect(doc.documentElement.style.colorScheme).toBe('dark');
    expect(meta.content).toMatch(/^#/);
  });
  it('supports a custom storage key', () => {
    expect(createThemeScript({ storageKey: 'x.theme' })).toContain('"x.theme"');
  });
  it('never throws when storage is unavailable', () => {
    const script = themeScript;
    expect(() => new Function('document', 'window', 'localStorage', script)({}, {}, null)).not.toThrow();
  });
});

describe('helpers', () => {
  it('resolveEffectiveTheme', () => {
    expect(resolveEffectiveTheme('SYSTEM', true)).toBe('dark');
    expect(resolveEffectiveTheme('LIGHT', true)).toBe('light');
    expect(resolveEffectiveTheme('DARK', false)).toBe('dark');
  });
  it('applyTheme updates the root', () => {
    const attrs: Record<string, string> = {};
    const doc = {
      documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; }, style: { colorScheme: '' } },
      querySelectorAll: () => [],
    };
    applyTheme('dark', doc);
    expect(attrs['data-theme']).toBe('dark');
  });
});
