import { gzipSync } from 'node:zlib';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, relative } from 'node:path';

const repository = new URL('../', import.meta.url);
const sourceRoots = ['apps', 'packages', 'infrastructure/lib', 'infrastructure/bin', 'scripts'];
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.mjs', '.js']);
const ignoredDirectories = new Set(['cdk.out', 'coverage', 'dist', 'node_modules']);
const failures = [];

async function filesBelow(url) {
  const entries = await readdir(url, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !ignoredDirectories.has(entry.name))
      .map(async (entry) => {
        const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
        return entry.isDirectory() ? filesBelow(child) : [child];
      })
  );
  return nested.flat();
}

function repoPath(url) {
  return relative(repository.pathname, url.pathname);
}

async function assertSourceSize() {
  const files = (
    await Promise.all(sourceRoots.map((root) => filesBelow(new URL(`${root}/`, repository))))
  )
    .flat()
    .filter((file) => sourceExtensions.has(extname(file.pathname)));
  for (const file of files) {
    const lines = (await readFile(file, 'utf8')).split('\n').length;
    if (lines > 300) failures.push(`${repoPath(file)} has ${lines} lines (limit 300)`);
  }
}

async function assertDrawingOnly() {
  const source = new URL('apps/web/src/', repository);
  const files = (await filesBelow(source)).filter((file) =>
    sourceExtensions.has(extname(file.pathname))
  );
  const forbidden = /dial[ -]?pad|key[ -]?pad|phone[ -]?pad|telephone[ -]?pad/i;
  for (const file of files) {
    if (forbidden.test(await readFile(file, 'utf8'))) {
      failures.push(`${repoPath(file)} reintroduces a forbidden phone-input fallback`);
    }
  }
}

async function assertBrowserBundles() {
  const assetDirectory = new URL('apps/web/dist/assets/', repository);
  const assets = (await filesBelow(assetDirectory)).filter(
    (file) => extname(file.pathname) === '.js'
  );
  for (const asset of assets) {
    const bytes = await readFile(asset);
    const gzipBytes = gzipSync(bytes).byteLength;
    if (gzipBytes > 112 * 1024) {
      failures.push(`${repoPath(asset)} is ${gzipBytes} gzip bytes (limit ${112 * 1024})`);
    }
  }
  const loader = new URL('apps/loader/dist/captcha.js', repository);
  if ((await stat(loader)).size > 16 * 1024) {
    failures.push(`${repoPath(loader)} exceeds the 16 KiB loader limit`);
  }
}

await assertSourceSize();
await assertDrawingOnly();
await assertBrowserBundles();

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Architecture and bundle ratchets passed.');
}
