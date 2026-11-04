import {FlatCompat} from '@eslint/eslintrc';

/**
 * Next's own rules (core web vitals, hooks, TypeScript) plus the full
 * jsx-a11y recommended set: Next enables only a handful of a11y rules, and an
 * unlabelled input is exactly the kind of thing that slips through them.
 */
const compat = new FlatCompat({baseDirectory: import.meta.dirname});

const config = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'plugin:jsx-a11y/recommended'),
  {
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
      'no-console': ['error', {allow: ['warn', 'error']}],
      // A code sample that scrolls sideways must be reachable by keyboard
      // (WCAG 2.1.1; axe: scrollable-region-focusable), so it is a focusable
      // role="region". The rule's default allows only tabpanel.
      'jsx-a11y/no-noninteractive-tabindex': ['error', {roles: ['tabpanel', 'region'], tags: []}],
    },
  },
  {
    // A CLI that reports to a terminal: console is its output, and
    // `cond ? ok() : fail()` is how every check in it reads.
    files: ['scripts/**'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-expressions': ['error', {allowTernary: true}],
    },
  },
];

export default config;
