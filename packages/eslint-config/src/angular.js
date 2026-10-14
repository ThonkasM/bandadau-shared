import globals from 'globals';

import base from './base.js';

export default [
  ...base,
  { languageOptions: { globals: globals.browser } },
  {
    files: ['**/*.ts'],
    rules: { '@typescript-eslint/no-extraneous-class': 'off', '@typescript-eslint/no-empty-function': 'off' },
  },
];
