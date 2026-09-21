import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/**
 * Layer boundaries are enforced here (fast editor feedback) and again in
 * tests/architecture/layer-boundaries.test.ts (authoritative allowlist check).
 *
 * Domain is the innermost layer: it may not import any external package, any
 * other application layer, or touch browser/UI globals.
 */
const domainRestrictedImports = [
  'error',
  {
    patterns: [
      {
        group: [
          'react',
          'react-dom',
          'react/*',
          'react-dom/*',
          'zustand',
          'zustand/*',
          'zod',
          '**/ui/**',
          '**/state/**',
          '**/infrastructure/**',
          '**/content/**',
          '**/app/**',
        ],
        message:
          'Domain must stay pure: no React/UI, no state, no infrastructure, no content, no external packages.',
      },
    ],
  },
]

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'public/sw.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': domainRestrictedImports,
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'Domain must not touch the DOM.' },
        { name: 'window', message: 'Domain must not touch the DOM.' },
        { name: 'localStorage', message: 'Domain must not touch browser storage.' },
        { name: 'indexedDB', message: 'Domain must not touch browser storage.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Domain randomness must flow through an injected RandomSource.',
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.tsx', 'src/app/**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
)
