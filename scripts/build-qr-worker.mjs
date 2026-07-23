import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

const outputDirectory = new URL('../apps/web/public/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });

await build({
  entryPoints: [new URL('../apps/web/src/features/qr/qr-worker.ts', import.meta.url).pathname],
  outfile: new URL('qr-worker.js', outputDirectory).pathname,
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  legalComments: 'none',
});
