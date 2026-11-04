import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';

/**
 * Unit tests only. Component tests opt into a DOM with
 * `// @vitest-environment happy-dom`; everything else runs in plain Node,
 * which is faster and cannot accidentally lean on a browser global.
 * The Playwright smoke test (`e2e/`) runs separately against a real build.
 */
export default defineConfig({
  esbuild: {jsx: 'automatic'},
  resolve: {alias: {'@': fileURLToPath(new URL('./', import.meta.url))}},
  test: {
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    restoreMocks: true,
  },
});
