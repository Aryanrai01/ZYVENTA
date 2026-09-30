import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts']),
  {
    // Explicit version: eslint-plugin-react's auto-detection uses an API removed in ESLint 10.
    settings: { react: { version: '19.3' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // All HTTP goes through src/lib/api-client.ts — no scattered fetch() calls.
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'Use apiClient from @/lib/api-client (or a service in @/services).',
        },
      ],
    },
  },
  {
    files: ['src/lib/api-client.ts', '**/*.test.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
]);
