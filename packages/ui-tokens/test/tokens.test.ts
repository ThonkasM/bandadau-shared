import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkContrast, contrastRatio, loadFlat, loadPairs } from '../scripts/check-contrast.mjs';
import { cssVarName, flatTokens, tokenNames, tokens } from '../src/index';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Semantic catalog of design-tokens-y-temas.md section 4
const REQUIRED = [
  ...['canvas', 'surface', 'surface-raised', 'muted', 'inverse'].map((n) => `color.bg.${n}`),
  ...['primary', 'secondary', 'muted', 'inverse', 'link', 'on-action'].map((n) => `color.text.${n}`),
  ...['default', 'strong', 'focus'].map((n) => `color.border.${n}`),
  ...['primary', 'secondary', 'danger'].flatMap((v) =>
    ['bg', 'bg-hover', 'bg-pressed', 'fg'].map((p) => `color.action.${v}.${p}`),
  ),
  'color.action.disabled.bg',
  'color.action.disabled.fg',
  ...['success', 'warning', 'danger', 'info'].flatMap((k) => ['bg', 'fg', 'border'].map((p) => `color.feedback.${k}.${p}`)),
  'color.brand.primary',
  'color.brand.accent',
  'color.brand.highlight',
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `color.chart.series.${i}`),
  'color.chart.grid',
  'color.chart.axis',
  ...['pending', 'confirmed', 'failed', 'cancelled'].map((s) => `color.status.registration.${s}`),
  ...['allow', 'review', 'block'].map((s) => `color.status.moderation.${s}`),
  ...['info', 'warning', 'critical'].map((s) => `color.severity.${s}`),
  ...['display', 'body', 'mono'].map((f) => `font.family.${f}`),
  ...['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'].map((s) => `font.size.${s}`),
  ...['regular', 'medium', 'semibold', 'bold'].map((w) => `font.weight.${w}`),
  ...['tight', 'normal', 'relaxed'].map((l) => `line-height.${l}`),
  ...[0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => `space.${n}`),
  ...['sm', 'md', 'lg', 'xl', 'full'].map((r) => `radius.${r}`),
  ...['sm', 'md', 'lg'].map((s) => `shadow.${s}`),
  ...['fast', 'normal', 'slow'].map((d) => `motion.duration.${d}`),
  ...['standard', 'emphasized'].map((e) => `motion.easing.${e}`),
  ...['dropdown', 'sticky', 'modal', 'toast'].map((z) => `z.${z}`),
];

describe('token catalog', () => {
  it('exposes the exact semantic catalog in both modes', () => {
    const names = new Set<string>(tokenNames);
    expect(REQUIRED.filter((n) => !names.has(n))).toEqual([]);
    for (const mode of ['light', 'dark'] as const) {
      expect(REQUIRED.filter((n) => !(n in flatTokens[mode]))).toEqual([]);
    }
  });

  it('has identical keys in light and dark', () => {
    expect(Object.keys(flatTokens.light)).toEqual(Object.keys(flatTokens.dark));
    expect(Object.keys(tokens.light.color)).toEqual(Object.keys(tokens.dark.color));
  });

  it('light and dark differ for themed colors', () => {
    expect(flatTokens.light['color.bg.canvas']).not.toBe(flatTokens.dark['color.bg.canvas']);
    expect(tokens.light.color.action.primary.bg).toBe('#1E5AA8');
  });

  it('keeps brand colors', () => {
    const css = fs.readFileSync(path.join(root, 'dist/css/tokens.css'), 'utf8');
    expect(css).toContain('#1E5AA8');
    expect(css).toContain('#F5B700');
    expect(css).toContain('#D7263D');
  });

  it('converts dimensions to numbers for React Native', () => {
    expect(tokens.light.space['4']).toBe(16);
    expect(tokens.light.font.size.md).toBe(16);
    expect(flatTokens.light['space.4']).toBe(16);
    expect(Array.isArray(tokens.light.shadow.sm)).toBe(true);
  });

  it('builds css var names', () => {
    expect(cssVarName('color.bg.surface')).toBe('--bd-color-bg-surface');
    expect(cssVarName('space.4')).toBe('--bd-space-4');
  });
});

describe('css outputs', () => {
  const css = fs.readFileSync(path.join(root, 'dist/css/tokens.css'), 'utf8');
  it('has light root and dark blocks', () => {
    expect(css).toMatch(/:root,\n\[data-theme='light'\]/);
    expect(css).toMatch(/\[data-theme='dark'\]/);
    expect(css).toContain('--bd-color-bg-surface:');
  });
  it('tailwind theme maps semantic utilities and resets raw palette', () => {
    const tw = fs.readFileSync(path.join(root, 'dist/css/tailwind-theme.css'), 'utf8');
    expect(tw).toContain('@theme inline');
    expect(tw).toContain('--color-*: initial;');
    expect(tw).toContain('--color-surface: var(--bd-color-bg-surface);');
    expect(tw).toContain('--color-action-primary: var(--bd-color-action-primary-bg);');
  });
  it('scss compiles', async () => {
    const sass = await import('sass');
    const result = sass.compileString(
      `@use 'tokens' as t; .a { color: t.$bd-color-text-primary; background: t.bd('color-bg-surface'); }`,
      { loadPaths: [path.join(root, 'dist/scss')] },
    );
    expect(result.css).toContain('var(--bd-color-text-primary)');
  });
});

describe('WCAG AA contrast', () => {
  it('passes for all declared pairs in light and dark', () => {
    const { failures, checked } = checkContrast(loadFlat(), loadPairs());
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(100);
  });

  it('detects a failing pair', () => {
    const flat = structuredClone(loadFlat());
    flat.light['color.text.primary'] = '#CCCCCC';
    const { failures } = checkContrast(flat, loadPairs());
    expect(failures.length).toBeGreaterThan(0);
  });

  it('computes known ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });
});
