import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// A skipped or focused test would let a gate pass without proving anything.
const noSkippedTests = ['test', 'it', 'describe'].flatMap((object) =>
  ['only', 'skip', 'todo', 'fixme'].map((property) => ({
    object,
    property,
    message: 'Tests may not be skipped or focused. Fix the test or the code.',
  })),
);

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-emulator/**',
      '**/node_modules/**',
      'archive/**',
      'sources/**',
      'playwright-report/**',
      'test-results/**',
      '**/coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-properties': ['error', ...noSkippedTests],
    },
  },
);
