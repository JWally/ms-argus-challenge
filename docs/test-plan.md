# Test plan

## Contract-first sequence

1. Capture current public behavior as executable schemas and fixtures.
2. Run black-box probes against Pair and save normalized responses.
3. Implement a Challenge vertical slice only after its test fails.
4. Run the same contract case against both services.
5. Add every discovered mismatch to this repository before fixing it.

## Unit tests

- Scoped CPI parsing and assurance resolution.
- Session request validation and server-owned policy.
- Pair/verdict token signing, binding, expiration, and malformed input.
- SSO callback validation, single-use approval, and replay rejection.
- Projection verdict and proof-of-life decisions.
- Browser message origin/source validation.

## Integration tests

- Start -> desktop attest -> phone attest -> verdict -> verify.
- WebSocket identity -> authenticated relay -> verdict release.
- Lost WebSocket -> authenticated result polling.
- Pair-token atomic redemption.
- SSO start -> scan -> proof -> approval -> exchange.
- Missing, dirty, or mismatched projections fail closed.
- Stolen, replayed, expired, cross-CPI, and cross-challenge artifacts fail.

Integration tests use deterministic clocks, IDs, secrets, stores, projections,
and publishers. They do not require AWS.

The unit-coverage ratchet measures executable code in `packages/`, where domain,
contract, and adapter behavior is isolated. Browser entrypoints and AWS
composition are intentionally measured by the browser and live-infrastructure
suites instead of inflating unit coverage with framework mocks.

## Browser E2E

Currently automated:

- Home, invalid embed, and non-hanging malformed SSO return behavior in desktop
  Chromium and mobile WebKit.
- Deployed loader mount, duplicate-mount rejection, destroy, and remount.
- Deployed browser session start through Argus and AWS to an encrypted QR.

Cutover backlog:

- Physical Chromium desktop to iOS/WebKit drawing-board completion.
- Accessibility interaction on the physical drawing surface.
- Deliberate WebSocket interruption followed by authenticated polling recovery.
- Real Google SSO success, cancellation, VPN interruption, and blocked-popup
  recovery.

## Live `dev-jw` E2E

- Real CloudFront/S3 delivery and security headers.
- Malformed and cross-origin HTTP requests fail closed.
- Real HTTP API, DynamoDB, Secrets Manager, and both WebSocket identities.
- Authenticated phone-to-desktop relay through API Gateway.
- Deployed worker SHA verification and client-decryptable ECDH QR frames.

Still required before cutover:

- Games consumer verification and a real SSO exchange.
- Attack harness probes against the deployed stack for replay, token theft,
  role swapping, downgraded proof, and forged projections.
