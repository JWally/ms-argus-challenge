module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'contracts-are-independent',
      severity: 'error',
      from: { path: '^packages/contracts/', pathNot: '\\.test\\.' },
      to: { path: '^(packages/(core|adapters|testkit)|apps|infrastructure)/' },
    },
    {
      name: 'core-does-not-depend-on-adapters-or-apps',
      severity: 'error',
      from: { path: '^packages/core/', pathNot: '\\.test\\.' },
      to: { path: '^(packages/(adapters|testkit)|apps|infrastructure)/' },
    },
    {
      name: 'adapters-do-not-depend-on-entrypoints',
      severity: 'error',
      from: { path: '^packages/adapters/' },
      to: { path: '^(apps|infrastructure)/' },
    },
    {
      name: 'web-does-not-import-server-or-infrastructure',
      severity: 'error',
      from: { path: '^apps/(web|loader)/' },
      to: { path: '^(apps/(api|websocket)|packages/adapters|infrastructure)/' },
    },
    {
      name: 'web-shared-does-not-import-features-or-pages',
      severity: 'error',
      from: { path: '^apps/web/src/shared/' },
      to: { path: '^apps/web/src/(features|pages)/' },
    },
    {
      name: 'web-components-are-feature-independent',
      severity: 'error',
      from: { path: '^apps/web/src/components/' },
      to: { path: '^apps/web/src/(features|pages)/' },
    },
    {
      name: 'web-features-do-not-import-pages',
      severity: 'error',
      from: { path: '^apps/web/src/features/' },
      to: { path: '^apps/web/src/pages/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: '(^|/)dist/|(^|/)coverage/|(^|/)cdk.out/',
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
