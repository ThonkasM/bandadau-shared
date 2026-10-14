import fs from 'node:fs';

import { defineConfig } from 'tsup';

const openapi = Object.fromEntries(
  fs.readdirSync('src/openapi').map((f) => [`openapi/${f.replace(/\.ts$/, '')}`, `src/openapi/${f}`]),
);

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    problem: 'src/problem.ts',
    events: 'src/events.ts',
    'graphql/admin': 'src/graphql/admin.ts',
    ...openapi,
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: false,
  treeshake: true,
});
