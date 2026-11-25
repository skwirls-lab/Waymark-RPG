import { defineConfig } from 'vitest/config';

// Run on demand with `npm run eval:ai`. Not part of `npm run verify`: it
// calls a real model, which costs money and needs a key.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['**/*.eval.ts'],
    testTimeout: 600_000,
  },
});
