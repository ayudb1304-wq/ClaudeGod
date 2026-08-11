import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '*.zip'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // CLAUDE.md: no `any`; use `unknown` plus narrowing.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // A leading underscore marks a parameter kept for signature shape only,
      // which is how mocks and interface implementations stay honest.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Production builds must not ship console spam (ARCHITECTURE §8).
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Config files and local tooling scripts are plain JS outside the TS
    // project; type-aware rules cannot resolve them and would error on the
    // project service lookup.
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // scripts/ runs under Node on a developer's machine, never in the browser
    // and never in the shipped extension.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', fetch: 'readonly' },
    },
    // A CLI tool's entire output is console. The no-console rule exists to keep
    // logging out of the shipped bundle, which this file is not part of.
    rules: { 'no-console': 'off' },
  },
);
