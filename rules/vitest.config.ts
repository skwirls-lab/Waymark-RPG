import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types.ts'],
      reporter: ['text-summary', 'json-summary'],
      // The phase 1 gate. Do not lower these.
      thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  },
});
