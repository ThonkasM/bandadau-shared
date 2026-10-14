import node from '@bandada/eslint-config/node';

export default [
  { ignores: ['**/dist/**', '**/src/generated/**', '**/node_modules/**'] },
  ...node,
];
