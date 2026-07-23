import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const outputDirectory = new URL('../apps/api/dist/', import.meta.url);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await build({
  entryPoints: {
    http: new URL('../apps/api/src/handler.ts', import.meta.url).pathname,
    websocket: new URL('../apps/api/src/websocket-handler.ts', import.meta.url).pathname,
  },
  outdir: outputDirectory.pathname,
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  legalComments: 'none',
});

const artifacts = await Promise.all(
  ['http.js', 'websocket.js'].map(async (file) => {
    const contents = await readFile(new URL(file, outputDirectory));
    return {
      file,
      bytes: contents.byteLength,
      sha256: createHash('sha256').update(contents).digest('hex'),
    };
  })
);

await writeFile(
  new URL('manifest.json', outputDirectory),
  `${JSON.stringify({ artifacts }, null, 2)}\n`
);
