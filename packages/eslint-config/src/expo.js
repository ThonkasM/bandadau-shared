import react from './react.js';

export default [
  ...react,
  { ignores: ['**/.expo/**', '**/android/**', '**/ios/**'] },
  {
    files: ['**/*.{jsx,tsx}'],
    rules: {
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
    },
  },
];
