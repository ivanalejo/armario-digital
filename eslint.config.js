import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const NO_NETWORK = 'La app no hace peticiones de red: los datos no salen del dispositivo (ver docs/ARCHITECTURE.md §9).';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'coverage', 'playwright-report', 'test-results', 'private'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
      // Garantía de privacidad: ninguna API de red en el código de la app.
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: NO_NETWORK },
        { name: 'XMLHttpRequest', message: NO_NETWORK },
        { name: 'WebSocket', message: NO_NETWORK },
        { name: 'EventSource', message: NO_NETWORK },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: NO_NETWORK },
        { object: 'window', property: 'fetch', message: NO_NETWORK },
        { object: 'globalThis', property: 'fetch', message: NO_NETWORK },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'e2e/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
