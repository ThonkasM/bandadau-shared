import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { extractErrorCodes, PROTOCOL_CODES } from '../scripts/extract-error-codes.mjs';
import { checkLocales } from '../scripts/i18n-check.mjs';
import { errorKey, errorMessage, resources } from '../src/catalogs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contracts = path.resolve(root, '../../../bandadau-docs/contracts');

describe('catalogs', () => {
  it('passes the i18n check (parity, ICU, placeholders)', async () => {
    const { errors } = await checkLocales({ dir: path.join(root, 'locales') });
    expect(errors).toEqual([]);
  });

  it('has the domain enums', () => {
    for (const name of ['RegistrationStatus', 'ReactionType', 'Role', 'EventStatus', 'TicketStatus', 'LedgerEntryType', 'NotificationType']) {
      expect(resources.es.enums).toHaveProperty(name);
      expect(resources.en.enums).toHaveProperty(name);
    }
    expect(resources.es.enums.RegistrationStatus.CONFIRMED).toBe('Confirmada');
    expect(resources.en.enums.Role.ORGANIZER).toBe('Organizer');
  });

  it('translates error codes and falls back for unknown ones', () => {
    expect(errorMessage('EVENT_FULL', 'en')).toContain('no seats');
    expect(errorKey('NOPE')).toBe('INTERNAL_ERROR');
    expect(errorKey(undefined)).toBe('INTERNAL_ERROR');
  });

  it.skipIf(!fs.existsSync(path.join(contracts, 'openapi')))(
    'covers every error code of the OpenAPI contracts in es and en',
    () => {
      const codes = [...extractErrorCodes(path.join(contracts, 'openapi')).keys(), ...PROTOCOL_CODES];
      expect(codes.length).toBeGreaterThan(50);
      for (const code of codes) {
        expect(resources.es.errors, code).toHaveProperty(code);
        expect(resources.en.errors, code).toHaveProperty(code);
      }
    },
  );
});

describe('i18n-check', () => {
  const write = (dir: string, locale: string, name: string, data: unknown) => {
    fs.mkdirSync(path.join(dir, locale), { recursive: true });
    fs.writeFileSync(path.join(dir, locale, `${name}.json`), JSON.stringify(data));
  };
  const tmp = () => fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? '/tmp'), 'i18n-'));

  it('detects missing keys, bad ICU and placeholder mismatches', async () => {
    const dir = tmp();
    write(dir, 'es', 'x', { a: 'Hola {name}', b: 'solo es', c: 'Hola {', d: '{n, plural, one {# a} other {# b}}' });
    write(dir, 'en', 'x', { a: 'Hello {user}', c: 'Hello', d: '{n, plural, one {# a} other {# b}}' });
    const { errors } = await checkLocales({ dir });
    const text = errors.join('\n');
    expect(text).toContain('x:b exists in es but not in en');
    expect(text).toContain('x:a placeholders differ');
    expect(text).toContain('es/x:c invalid ICU message');
    expect(text).not.toContain('x:d');
    fs.rmSync(dir, { recursive: true });
  });

  it('detects keys used in source that do not exist and reports unused ones', async () => {
    const dir = tmp();
    write(dir, 'es', 'feed', { title: 'Inicio', orphan: 'x' });
    write(dir, 'en', 'feed', { title: 'Home', orphan: 'x' });
    const src = path.join(dir, 'src');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'a.tsx'), `t('feed.title'); t('feed:title'); t('feed.missing'); t(\`dyn.\${x}\`)`);
    const { errors, warnings } = await checkLocales({ dir, srcDir: src });
    expect(errors.join('\n')).toContain('feed.missing');
    expect(warnings.join('\n')).toContain('unused key feed:orphan');
    fs.rmSync(dir, { recursive: true });
  });
});
