import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

import base from './base.js';
import { noLiteralColorInStyleSelectors, noRawPaletteSelectors } from './rules.js';

export default [
  ...base,
  { languageOptions: { globals: { ...globals.browser, ...globals.es2022 } } },
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-key': 'error',
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
      'no-restricted-syntax': ['error', ...noRawPaletteSelectors, ...noLiteralColorInStyleSelectors],
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/*.stories.{ts,tsx}'],
    rules: { 'react/jsx-no-literals': 'off' },
  },
];
