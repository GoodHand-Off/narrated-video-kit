import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fontStub = fileURLToPath(new URL('./test/stubs/font.ts', import.meta.url));

export default defineConfig({
  resolve: {
    // Google Fonts load over the network and need FontFace, which happy-dom lacks.
    alias: {
      '@remotion/google-fonts/Inter': fontStub,
      '@remotion/google-fonts/JetBrainsMono': fontStub,
    },
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
      // Exceptions, each with its reason:
      // - src/index.ts and src/Root.tsx only register compositions with Remotion. Remotion
      //   reads them when it bundles, so `npm run build` and `npm run smoke` (both in CI)
      //   exercise every line; a unit test would only restate the list.
      exclude: ['src/index.ts', 'src/Root.tsx'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
