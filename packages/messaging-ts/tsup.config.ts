import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', nest: 'src/nest/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: ['@nestjs/common', '@nestjs/core', 'reflect-metadata', 'rxjs', 'mongodb'],
});
