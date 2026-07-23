import { join } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const repository = join(import.meta.dirname, '../..');

describe('Lambda entrypoint isolation', () => {
  it('keeps HTTP-only QR/native-image adapters out of the WebSocket bundle', async () => {
    const result = await build({
      entryPoints: [join(repository, 'apps/api/src/websocket-handler.ts')],
      bundle: true,
      format: 'cjs',
      platform: 'node',
      target: 'node22',
      metafile: true,
      write: false,
      logLevel: 'silent',
    });
    const inputs = Object.keys(result.metafile.inputs);

    expect(inputs.some((path) => path.includes('packages/adapters/src/qr/'))).toBe(false);
    expect(inputs.some((path) => path.includes('node_modules/sharp/'))).toBe(false);
  });
});
