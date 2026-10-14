import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import react from '../src/react.js';

const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: react as never });

async function lint(code: string, filePath = 'x.tsx') {
  const [result] = await eslint.lintText(code, { filePath });
  return result!.messages;
}

describe('react preset', () => {
  it('rejects raw palette classes', async () => {
    const msgs = await lint('export const A = () => <div className="bg-blue-600 p-2" />;');
    expect(msgs.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(true);
  });
  it('rejects raw palette inside cn()', async () => {
    const msgs = await lint('const x = cn("flex", cond && "text-gray-500");');
    expect(msgs.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(true);
  });
  it('rejects arbitrary hex colors', async () => {
    const msgs = await lint('export const A = () => <div className="bg-[#fff]" />;');
    expect(msgs.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(true);
  });
  it('rejects literal colors in style objects', async () => {
    const msgs = await lint('const s = { backgroundColor: "#FF0000" };');
    expect(msgs.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(true);
  });
  it('rejects JSX literals', async () => {
    const msgs = await lint('export const A = () => <p>Hola</p>;');
    expect(msgs.some((m) => m.ruleId === 'react/jsx-no-literals')).toBe(true);
  });
  it('accepts semantic classes and i18n expressions', async () => {
    const msgs = await lint(
      'export const A = ({t}: {t:(k:string)=>string}) => <p className="bg-surface text-primary border-default">{t("a.b")}</p>;',
    );
    expect(msgs.filter((m) => m.severity === 2)).toEqual([]);
  });
});
