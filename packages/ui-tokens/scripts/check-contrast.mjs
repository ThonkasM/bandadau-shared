import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function channel(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Unsupported color (expected opaque #RRGGBB): ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex) {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function checkContrast(flat, pairs) {
  const failures = [];
  let checked = 0;
  for (const mode of ['light', 'dark']) {
    for (const { fg, bg, min } of pairs) {
      const f = flat[mode][fg];
      const b = flat[mode][bg];
      if (!f || !b) {
        failures.push({ mode, fg, bg, min, ratio: null, reason: 'missing token' });
        continue;
      }
      const ratio = contrastRatio(f, b);
      checked += 1;
      if (ratio < min) failures.push({ mode, fg, bg, min, ratio: Number(ratio.toFixed(2)) });
    }
  }
  return { failures, checked };
}

export function loadPairs() {
  return JSON.parse(fs.readFileSync(path.join(root, 'contrast-pairs.json'), 'utf8')).pairs;
}

export function loadFlat() {
  return JSON.parse(fs.readFileSync(path.join(root, 'dist/json/tokens.flat.json'), 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { failures, checked } = checkContrast(loadFlat(), loadPairs());
  if (failures.length > 0) {
    for (const f of failures) {
      console.error(`FAIL [${f.mode}] ${f.fg} on ${f.bg}: ${f.ratio ?? f.reason} < ${f.min}`);
    }
    process.exit(1);
  }
  console.log(`contrast: ${checked} pair checks passed (WCAG AA, light + dark)`);
}
