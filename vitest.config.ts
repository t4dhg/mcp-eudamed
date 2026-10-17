import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/cli.ts', 'src/index.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 85, statements: 85, functions: 85, branches: 80 },
    },
  },
});
