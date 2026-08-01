import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@argus-challenge/adapters/drawing': `${root}packages/adapters/src/drawing/index.ts`,
      '@argus-challenge/adapters/qr': `${root}packages/adapters/src/qr/index.ts`,
      '@argus-challenge/adapters': `${root}packages/adapters/src/index.ts`,
      '@argus-challenge/contracts/browser/captcha-message': `${root}packages/contracts/src/browser/captcha-message.ts`,
      '@argus-challenge/contracts/drawing/picture-bundle': `${root}packages/contracts/src/drawing/picture-bundle.ts`,
      '@argus-challenge/contracts/qr/ecdh-seal': `${root}packages/contracts/src/qr/ecdh-seal.ts`,
      '@argus-challenge/contracts/qr/frame-bundle': `${root}packages/contracts/src/qr/frame-bundle.ts`,
      '@argus-challenge/contracts/verdicts/fixed-envelope': `${root}packages/contracts/src/verdicts/fixed-envelope.ts`,
      '@argus-challenge/contracts': `${root}packages/contracts/src/index.ts`,
      '@argus-challenge/core': `${root}packages/core/src/index.ts`,
      '@argus-challenge/testkit': `${root}packages/testkit/src/index.ts`,
    },
  },
  test: {
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'apps/**/*.test.ts',
      'infrastructure/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/**/src/**/*.ts'],
      exclude: [
        '**/index.ts',
        '**/types.ts',
        '**/application-response.ts',
        '**/passkey-store.ts',
        '**/session.ts',
        '**/verdict-claims.ts',
      ],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 85,
      },
    },
  },
});
