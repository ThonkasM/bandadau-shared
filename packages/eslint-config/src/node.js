import globals from 'globals';

import base from './base.js';

export default [
  ...base,
  { languageOptions: { globals: globals.node } },
  {
    files: ['**/*.{test,spec}.{ts,tsx,js,mjs}', '**/test/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-console': 'off' },
  },
];
