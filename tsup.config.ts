import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  // Optional DB drivers are lazy-imported at runtime; never bundle them.
  external: ['pg', 'mysql2'],
});
