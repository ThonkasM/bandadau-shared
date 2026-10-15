import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import StyleDictionary from 'style-dictionary';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'bd';
const MODES = ['light', 'dark'];
const NOT_EMITTED = ['primitive/color.tokens.json', 'primitive/shadow.tokens.json'];

async function resolveMode(mode) {
  const sd = new StyleDictionary({
    usesDtcg: true,
    source: [
      path.join(root, 'tokens/primitive/*.tokens.json'),
      path.join(root, `tokens/semantic/color.${mode}.tokens.json`),
      path.join(root, 'tokens/component/*.tokens.json'),
    ],
    log: { warnings: 'error', verbosity: 'default' },
    platforms: { raw: { transforms: [], buildPath: 'dist/' } },
  });
  const platform = await sd.getPlatformTokens('raw');
  return platform.allTokens
    .filter((t) => !NOT_EMITTED.some((f) => t.filePath.endsWith(f)))
    .map((t) => ({ path: t.path, type: t.$type ?? inferType(t.$value), value: t.$value, description: t.$description }));
}

// Component tokens that are pure references have no $type of their own.
function inferType(value) {
  if (Array.isArray(value)) return typeof value[0] === 'object' ? 'shadow' : 'cubicBezier';
  if (typeof value === 'number') return 'number';
  if (/^-?[\d.]+(px|rem)$/.test(value)) return 'dimension';
  if (/^-?[\d.]+ms$/.test(value)) return 'duration';
  if (/^(#|rgba?\()/.test(value)) return 'color';
  return 'string';
}

const px = (v) => (typeof v === 'string' && v.endsWith('px') ? Number.parseFloat(v) : null);
const rem = (v) => (typeof v === 'string' && v.endsWith('rem') ? Number.parseFloat(v) * 16 : null);
const ms = (v) => (typeof v === 'string' && v.endsWith('ms') ? Number.parseFloat(v) : null);

export function cssValue(t) {
  if (t.type === 'shadow') {
    return t.value.map((l) => `${l.offsetX} ${l.offsetY} ${l.blur} ${l.spread} ${l.color}`).join(', ');
  }
  if (t.type === 'cubicBezier') return `cubic-bezier(${t.value.join(', ')})`;
  return String(t.value);
}

function tsValue(t) {
  if (t.type === 'shadow') {
    return t.value.map((l) => ({
      color: l.color,
      offsetX: px(l.offsetX) ?? 0,
      offsetY: px(l.offsetY) ?? 0,
      blur: px(l.blur) ?? 0,
      spread: px(l.spread) ?? 0,
    }));
  }
  if (t.type === 'cubicBezier') return cssValue(t);
  if (t.type === 'number' || t.type === 'fontWeight') return Number(t.value);
  if (t.type === 'dimension' || t.type === 'duration') {
    return px(t.value) ?? rem(t.value) ?? ms(t.value) ?? t.value;
  }
  return t.value;
}

const dotted = (t) => t.path.join('.');
const cssVar = (t) => `--${PREFIX}-${t.path.join('-')}`;

function tailwindName(t) {
  const [a, b, c, d] = t.path;
  const p = t.path;
  if (a === 'color') {
    if (b === 'bg') return `color-${c === 'canvas' || c === 'surface' || c === 'surface-raised' ? c : `surface-${c}`}`;
    if (b === 'text') return `color-${c}`;
    if (b === 'border') return `color-${c}`;
    if (b === 'action') {
      if (c === 'disabled') return d === 'bg' ? 'color-action-disabled' : 'color-action-disabled-fg';
      const suffix = { bg: '', 'bg-hover': '-hover', 'bg-pressed': '-pressed', fg: '-fg' }[d];
      return `color-action-${c}${suffix}`;
    }
    if (b === 'feedback') return `color-feedback-${c}${d === 'bg' ? '' : `-${d}`}`;
    if (b === 'chart') return b && c === 'series' ? `color-chart-${d}` : `color-chart-${c}`;
    return `color-${p.slice(1).join('-')}`;
  }
  if (a === 'font' && b === 'family') return `font-${c}`;
  if (a === 'font' && b === 'size') return `text-${c}`;
  if (a === 'font' && b === 'weight') return `font-weight-${c}`;
  if (a === 'line-height') return `leading-${b}`;
  if (a === 'radius') return `radius-${b}`;
  if (a === 'shadow') return `shadow-${b}`;
  if (a === 'motion' && b === 'easing') return `ease-${c}`;
  return null;
}

function nest(entries) {
  const root = {};
  for (const { path: p, value } of entries) {
    let node = root;
    p.slice(0, -1).forEach((k) => {
      node[k] ??= {};
      node = node[k];
    });
    node[p.at(-1)] = value;
  }
  return root;
}

const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
function toTs(value, indent = 2) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) return `[${value.map((v) => toTs(v, indent + 2)).join(', ')}]`;
  if (value && typeof value === 'object') {
    const lines = Object.entries(value).map(([k, v]) => `${pad}${key(k)}: ${toTs(v, indent + 2)},`);
    return `{\n${lines.join('\n')}\n${' '.repeat(indent - 2)}}`;
  }
  return JSON.stringify(value);
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export async function buildTokens() {
  const [light, dark] = await Promise.all(MODES.map(resolveMode));
  const names = light.map(dotted);
  if (JSON.stringify(names) !== JSON.stringify(dark.map(dotted))) {
    const a = new Set(names);
    const diff = dark.map(dotted).filter((n) => !a.has(n));
    throw new Error(`light/dark token sets differ. Only in dark: ${diff.join(', ')}`);
  }
  const darkByName = new Map(dark.map((t) => [dotted(t), t]));
  const header = '/* Generated by build/style-dictionary.config.mjs. Do not edit. */\n';

  // CSS custom properties
  const decl = (list) => list.map((t) => `  ${cssVar(t)}: ${cssValue(t)};`).join('\n');
  const darkDiff = light
    .map((t) => darkByName.get(dotted(t)))
    .filter((d, i) => cssValue(d) !== cssValue(light[i]));
  write(
    path.join(root, 'dist/css/tokens.css'),
    `${header}:root,\n[data-theme='light'] {\n  color-scheme: light;\n${decl(light)}\n}\n\n[data-theme='dark'] {\n  color-scheme: dark;\n${decl(darkDiff)}\n}\n`,
  );

  // Tailwind v4 theme
  const seen = new Map();
  const twLines = [];
  for (const t of light) {
    const n = tailwindName(t);
    if (!n) continue;
    if (seen.has(n)) throw new Error(`Tailwind name collision: ${n} (${dotted(t)} vs ${seen.get(n)})`);
    seen.set(n, dotted(t));
    twLines.push(`  --${n}: var(${cssVar(t)});`);
  }
  write(
    path.join(root, 'dist/css/tailwind-theme.css'),
    `${header}@theme inline {\n  --color-*: initial;\n${twLines.join('\n')}\n}\n`,
  );

  // SCSS
  const scssVars = light.map((t) => `$${PREFIX}-${t.path.join('-')}: var(${cssVar(t)});`).join('\n');
  const scssMap = light.map((t) => `  '${t.path.join('-')}': var(${cssVar(t)}),`).join('\n');
  write(
    path.join(root, 'dist/scss/_tokens.scss'),
    `// Generated by build/style-dictionary.config.mjs. Do not edit.\n@use 'sass:map';\n\n${scssVars}\n\n$${PREFIX}-tokens: (\n${scssMap}\n);\n\n@function ${PREFIX}($name) {\n  @return map.get($${PREFIX}-tokens, $name);\n}\n`,
  );

  // Flat JSON (docs / Figma / contrast check)
  const flat = Object.fromEntries(
    MODES.map((m, i) => [m, Object.fromEntries([light, dark][i].map((t) => [dotted(t), cssValue(t)]))]),
  );
  write(path.join(root, 'dist/json/tokens.flat.json'), `${JSON.stringify(flat, null, 2)}\n`);

  // Typed TS
  const tree = (list) => nest(list.map((t) => ({ path: t.path, value: tsValue(t) })));
  const flatTs = (list) =>
    Object.fromEntries(list.map((t) => [dotted(t), tsValue(t)]));
  const ts = `${header}
const light = ${toTs(tree(light))} as const;

const dark = ${toTs(tree(dark))} as const;

type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends readonly unknown[]
      ? { [K in keyof T]: Widen<T[K]> }
      : { -readonly [K in keyof T]: Widen<T[K]> };

export type ThemeName = 'light' | 'dark';
export type ThemeTokens = Widen<typeof light>;

export const tokens: Record<ThemeName, ThemeTokens> = { light, dark };

export const tokenNames = ${toTs(names, 2)} as const;
export type TokenName = (typeof tokenNames)[number];

export type FlatTokenValue = string | number | ReadonlyArray<{ color: string; offsetX: number; offsetY: number; blur: number; spread: number }>;

export const flatTokens: Record<ThemeName, Record<TokenName, FlatTokenValue>> = {
  light: ${toTs(flatTs(light), 4)},
  dark: ${toTs(flatTs(dark), 4)},
};

export const cssVarPrefix = '--${PREFIX}-';
export function cssVarName(name: TokenName): string {
  return \`--${PREFIX}-\${name.replace(/\\./g, '-')}\`;
}
`;
  write(path.join(root, 'src/generated/tokens.ts'), ts);
  write(path.join(root, 'dist/ts/tokens.ts'), ts);
  return { count: light.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { count } = await buildTokens();
  console.log(`ui-tokens: ${count} tokens -> dist/{css,scss,json,ts}`);
}
