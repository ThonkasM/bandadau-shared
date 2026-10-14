// Verifier used by every Bandada app: same keys in es/en, valid ICU, same placeholders,
// (optional) keys used in source exist, (optional) every OpenAPI error code is translated.
import fs from 'node:fs';
import path from 'node:path';

import { parse, TYPE } from '@formatjs/icu-messageformat-parser';

const LOCALES = ['es', 'en'];
const SOURCE_EXT = /\.(tsx?|jsx?|mjs|html)$/;
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.expo', '.angular', 'coverage', '.git', 'generated']);

export function flatten(obj, prefix = '', out = {}, errors = [], file = '') {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out, errors, file);
    else errors.push(`${file}: "${key}" must be a string or an object`);
  }
  return out;
}

export function placeholders(ast, out = new Set()) {
  for (const el of ast) {
    switch (el.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        out.add(el.value);
        break;
      case TYPE.select:
      case TYPE.plural:
        out.add(el.value);
        for (const opt of Object.values(el.options)) placeholders(opt.value, out);
        break;
      case TYPE.tag:
        out.add(`<${el.value}>`);
        placeholders(el.children, out);
        break;
      default:
    }
  }
  return out;
}

function readNamespaces(dir, locale) {
  const base = path.join(dir, locale);
  if (!fs.existsSync(base)) return null;
  const result = {};
  for (const file of fs.readdirSync(base).filter((f) => f.endsWith('.json')).sort()) {
    result[file.replace(/\.json$/, '')] = path.join(base, file);
  }
  return result;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
    } else if (SOURCE_EXT.test(entry.name)) files.push(path.join(dir, entry.name));
  }
  return files;
}

export function collectUsedKeys(srcDir) {
  const used = new Map();
  const patterns = [
    /(?<![\w$.])\$?t\(\s*(['"`])([A-Za-z][\w.:-]*)\1/g,
    /\bi18nKey=(['"])([A-Za-z][\w.:-]*)\1/g,
    /(['"])([A-Za-z][\w.:-]*)\1\s*\|\s*transloco\b/g,
  ];
  for (const file of walk(srcDir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const re of patterns) {
      for (const m of text.matchAll(re)) {
        const list = used.get(m[2]) ?? [];
        list.push(path.relative(srcDir, file));
        used.set(m[2], list);
      }
    }
  }
  return used;
}

export async function checkLocales({ dir, srcDir, contractsDir }) {
  const errors = [];
  const warnings = [];
  const byLocale = {};
  const namespaces = {};
  for (const locale of LOCALES) {
    const ns = readNamespaces(dir, locale);
    if (!ns) {
      errors.push(`missing locale directory: ${path.join(dir, locale)}`);
      continue;
    }
    namespaces[locale] = ns;
    byLocale[locale] = {};
    for (const [name, file] of Object.entries(ns)) {
      let json;
      try {
        json = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        errors.push(`${file}: invalid JSON (${e.message})`);
        continue;
      }
      byLocale[locale][name] = flatten(json, '', {}, errors, file);
    }
  }
  if (errors.length > 0 && LOCALES.some((l) => !byLocale[l])) return { errors, warnings };

  const names = new Set(LOCALES.flatMap((l) => Object.keys(byLocale[l])));
  for (const name of names) {
    for (const locale of LOCALES) {
      if (!byLocale[locale][name]) errors.push(`${locale}/${name}.json: missing file (exists in the other locale)`);
    }
    const [es, en] = LOCALES.map((l) => byLocale[l][name]);
    if (!es || !en) continue;
    for (const key of Object.keys(es)) if (!(key in en)) errors.push(`${name}:${key} exists in es but not in en`);
    for (const key of Object.keys(en)) if (!(key in es)) errors.push(`${name}:${key} exists in en but not in es`);
    for (const key of Object.keys(es)) {
      if (!(key in en)) continue;
      const sets = [];
      for (const locale of LOCALES) {
        const message = byLocale[locale][name][key];
        if (message.trim() === '') warnings.push(`${locale}/${name}:${key} is empty`);
        try {
          sets.push(placeholders(parse(message, { requiresOtherClause: true })));
        } catch (e) {
          errors.push(`${locale}/${name}:${key} invalid ICU message: ${e.message}`);
          sets.push(null);
        }
      }
      if (sets[0] && sets[1]) {
        const a = [...sets[0]].sort().join(',');
        const b = [...sets[1]].sort().join(',');
        if (a !== b) errors.push(`${name}:${key} placeholders differ (es: {${a}} / en: {${b}})`);
      }
    }
  }

  if (srcDir) {
    const all = new Map();
    for (const [name, keys] of Object.entries(byLocale.es)) for (const key of Object.keys(keys)) all.set(`${name}:${key}`, false);
    const used = collectUsedKeys(srcDir);
    for (const [raw, files] of used) {
      const [maybeNs, ...rest] = raw.includes(':') ? raw.split(':') : [null, raw];
      const key = rest.join(':');
      const candidates = maybeNs
        ? [`${maybeNs}:${key}`]
        : [...all.keys()].filter((k) => k.endsWith(`:${key}`) || k === `${key.split('.')[0]}:${key.split('.').slice(1).join('.')}`);
      const hit = candidates.find((c) => all.has(c));
      if (!hit) errors.push(`key "${raw}" used in ${[...new Set(files)].join(', ')} does not exist`);
      else all.set(hit, true);
    }
    for (const [k, isUsed] of all) {
      if (!isUsed) warnings.push(`unused key ${k}`);
    }
  }

  if (contractsDir) {
    const { extractErrorCodes, PROTOCOL_CODES } = await import('./extract-error-codes.mjs');
    const openapi = path.join(contractsDir, 'openapi');
    const codes = new Set([...extractErrorCodes(openapi).keys(), ...PROTOCOL_CODES]);
    for (const locale of LOCALES) {
      for (const code of codes) {
        if (!byLocale[locale].errors?.[code]) errors.push(`${locale}/errors.json: missing message for error code ${code}`);
      }
    }
  }
  return { errors, warnings };
}

export async function run(argv) {
  const flags = new Set(['--strict']);
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (flags.has(arg)) continue;
    if (arg.startsWith('--')) {
      options[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else positional.push(arg);
  }
  const dir = positional[0];
  if (!dir) {
    console.error('usage: bandada-i18n-check <locales-dir> [--src <dir>] [--contracts <dir>] [--strict]');
    return 2;
  }
  let contractsDir = options.contracts ? path.resolve(options.contracts) : undefined;
  const preWarnings = [];
  if (contractsDir && !fs.existsSync(path.join(contractsDir, 'openapi'))) {
    preWarnings.push(`contracts directory not found, skipping error-code coverage: ${contractsDir}`);
    contractsDir = undefined;
  }
  const { errors, warnings: found } = await checkLocales({
    dir: path.resolve(dir),
    srcDir: options.src ? path.resolve(options.src) : undefined,
    contractsDir,
  });
  const warnings = [...preWarnings, ...found];
  for (const w of warnings) console.warn(`warn  ${w}`);
  for (const e of errors) console.error(`error ${e}`);
  const strict = argv.includes('--strict') && warnings.length > 0;
  if (errors.length > 0 || strict) {
    console.error(`i18n-check failed: ${errors.length} error(s), ${warnings.length} warning(s)`);
    return 1;
  }
  console.log(`i18n-check ok (${warnings.length} warning(s))`);
  return 0;
}
