import { rm } from 'node:fs/promises';

const outputs = [
  '../apps/api/dist/',
  '../apps/loader/dist/',
  '../apps/web/dist/',
  '../coverage/',
  '../infrastructure/cdk.out/',
  '../playwright-report/',
  '../test-results/',
];

await Promise.all(
  outputs.map((path) => rm(new URL(path, import.meta.url), { recursive: true, force: true }))
);
