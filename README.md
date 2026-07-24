# ms-argus-challenge

Contract-compatible, cross-device assurance service for Argus. It replaces the
current Pair implementation without carrying its directory layout forward.

The service owns the browser loader, embedded drawing-board experience, mobile
handoff, pairing state machine, proof-of-life, SSO continuity, verdict tokens,
HTTP API, and WebSocket transport. It integrates with Argus merchant projections
through an explicit adapter.

## Status

The parallel `dev-jw` stack is live at
[`challenge-dev-jw.argus.pw`](https://challenge-dev-jw.argus.pw). Its deployment
gate exercises CloudFront/S3, the HTTP API, DynamoDB, both authenticated
WebSocket roles and relay, QR worker delivery, encrypted QR delivery, and the
loader in a real Chromium browser.

No Pair domain or Games consumer points at Challenge. Cutover remains blocked
on black-box differential checks, a physical two-device run, consumer tests,
and rollback rehearsal; see [the compatibility matrix](docs/compatibility.md).

## Design

- `apps/` contains thin deployable entrypoints and browser applications.
- `packages/contracts/` defines public runtime-validated protocols.
- `packages/core/` contains pure policy and application workflows.
- `packages/adapters/` contains DynamoDB, projection, WebSocket, secret, and
  crypto integrations.
- `packages/testkit/` contains deterministic fakes and contract fixtures.
- `infrastructure/` contains CDK composition only.

See [Architecture](docs/architecture.md), [Test plan](docs/test-plan.md), and
[Operations](docs/operations.md).

## Browser result contract

The embed callback receives only:

```ts
{
  sessionId: string;
  token: string;
}
```

The callback is a delivery notification, not an authorization decision. Send
the token to the merchant backend, call `POST /api/verify` with the exact
scoped CPI and backend-generated challenge ID, and gate only when the response
contains `passed: true`. Challenge never posts its client-decrypted verdict or
reason across the iframe boundary.

## Commands

```bash
npm install
npm test
npm run test:integration
npm run test:browser
npm run quality
npm run deploy:dev
```

Node 22 is required. Deployments default to an isolated `dev-jw` namespace and
do not modify the existing Pair or Games stacks. `npm run deploy:dev` refuses to
stop at a successful CloudFormation update: the live infrastructure and browser
suites must also pass.
