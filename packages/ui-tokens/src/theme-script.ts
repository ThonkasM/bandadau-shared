import { tokens } from './generated/tokens';

export type ThemePreference = 'SYSTEM' | 'LIGHT' | 'DARK';
export type EffectiveTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'bandada.theme';

export function resolveEffectiveTheme(preference: ThemePreference, systemPrefersDark: boolean): EffectiveTheme {
  if (preference === 'LIGHT') return 'light';
  if (preference === 'DARK') return 'dark';
  return systemPrefersDark ? 'dark' : 'light';
}

interface ThemeRoot {
  setAttribute(name: string, value: string): void;
  style: { colorScheme: string };
}

/** Runtime counterpart of the inline script: sets data-theme, color-scheme and theme-color metas. */
export function applyTheme(
  effective: EffectiveTheme,
  doc: { documentElement: ThemeRoot; querySelectorAll(selector: string): ArrayLike<{ setAttribute(n: string, v: string): void }> },
): void {
  doc.documentElement.setAttribute('data-theme', effective);
  doc.documentElement.style.colorScheme = effective;
  const metas = doc.querySelectorAll('meta[name="theme-color"]');
  for (let i = 0; i < metas.length; i += 1) {
    metas[i]?.setAttribute('content', tokens[effective].color.bg.canvas);
  }
}

/** Inline anti-FOUC script: place it in <head> before first paint. */
export function createThemeScript(options: { storageKey?: string } = {}): string {
  const key = JSON.stringify(options.storageKey ?? THEME_STORAGE_KEY);
  const colors = JSON.stringify({ light: tokens.light.color.bg.canvas, dark: tokens.dark.color.bg.canvas });
  return (
    `(function(){try{var k=${key},c=${colors},p=null;` +
    `try{p=localStorage.getItem(k)}catch(e){}` +
    `var d=p==='DARK'||(p!=='LIGHT'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);` +
    `var t=d?'dark':'light',r=document.documentElement;` +
    `r.setAttribute('data-theme',t);r.style.colorScheme=t;` +
    `var m=document.querySelectorAll('meta[name="theme-color"]');` +
    `for(var i=0;i<m.length;i++){m[i].setAttribute('content',c[t])}` +
    `}catch(e){}})();`
  );
}

export const themeScript: string = createThemeScript();
