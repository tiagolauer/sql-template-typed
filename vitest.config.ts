import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    include: /\.[cm]?[tj]sx?$/,
  },
  resolve: {
    extensions: ['.mts', '.cts', '.ts', '.mjs', '.cjs', '.js', '.json'],
  },
});
