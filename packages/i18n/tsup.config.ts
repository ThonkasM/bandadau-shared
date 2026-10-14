import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/format.ts', 'src/resolve-locale.ts', 'src/config.ts', 'src/errors.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
});
