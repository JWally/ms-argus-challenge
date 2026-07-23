import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const outputDirectory = new URL('../apps/loader/dist/', import.meta.url);
const outputFile = new URL('captcha.js', outputDirectory);
const embedOrigin = process.env.CHALLENGE_EMBED_ORIGIN || '__SCRIPT_ORIGIN__';

await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [new URL('../apps/loader/src/loader.ts', import.meta.url).pathname],
  outfile: outputFile.pathname,
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  define: { __EMBED_ORIGIN__: JSON.stringify(embedOrigin) },
  legalComments: 'none',
});

const source = await import('node:fs/promises').then(({ readFile }) => readFile(outputFile));
const integrity = `sha384-${createHash('sha384').update(source).digest('base64')}`;
await writeFile(
  new URL('captcha-sri.json', outputDirectory),
  `${JSON.stringify({ file: 'captcha.js', integrity }, null, 2)}\n`
);
