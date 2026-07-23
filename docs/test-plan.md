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

## Red-team hardening regressions

- Browser result callbacks expose only a non-empty server verdict token and
  session identifier; the client-decided verdict and reason never cross the
  merchant boundary.
- A missing, malformed, or unavailable verdict token prevents the result
  callback instead of silently reporting completion.
- Challenge document response policies allow Challenge-origin and required blob
  workers, while continuing to reject data and cross-origin worker sources.
- WebSocket identity rejects a declared origin that contradicts the handshake
  origin, and sealed connection envelopes expire with the five-minute session.
- Session creation fails closed when the rate-limit store is unavailable.
- SSO return-code and approval-token hashes use one constant-time comparison
  primitive and reject malformed digest lengths.
- Pair and all three SSO legs fail closed unless their current, verified API
  projections carry the device id derived from the exact public key that signs
  the corresponding Challenge attestation.
- External attack-harness and live-target checks are intentionally delegated;
  they are not part of the local implementation run.

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

## Pair experience parity

Pair remains the behavioral and visual reference for the public experience, not
an implementation template. Challenge must preserve these user-facing
contracts while keeping its `contracts <- core <- adapters <- entrypoints`
dependency direction:

- Desktop demo presents pairing; phone-sized demo presents mobile SSO instead
  of asking one phone to scan itself.
- The embedded widget uses Pair's QR reticle, explicit desktop-to-phone
  handshake rail, and settled verification states.
- The phone uses the full-screen three-letter biometric drawing board with no
  dial pad or alternate fallback.
- Redeeming the single-use QR link replaces the phone route inside the existing
  browser document; it must not reload the app or integrity bootstrap between
  the opening state and the drawing board.
- Drawing guidance appears only before the first stroke of the three-letter
  challenge; advancing to later letters does not present the instructions again.
- The drawing-board primary action uses a filled white, dark-label ready state
  and a transparent white-label disabled inverse so both states remain legible.
- A successfully submitted phone challenge dismisses its phone page. It first
  requests browser tab closure, then falls back to browser history or a blank
  terminal page when mobile browser policy blocks `window.close()`.
- The hosted SSO journey uses the three-step Argus status shell; the unbound
  demo uses the separate daylight merchant launch and result surfaces.
- `.fastpass` validates without proof, `.stepup` tries device trust before
  offering explicit proof, and `.forceauth` always offers a fresh passkey or
  Google proof.

The TDD evidence for this surface is split deliberately:

- Pure presentation and assurance transitions are unit-tested.
- Responsive entry points, semantic state, and computed visual invariants are
  browser-tested in Chromium and mobile WebKit.
- A top-level browser navigation counter guards the QR-link redemption handoff
  against reintroducing a hard navigation.
- The deployed gate proves the real QR path and a phone-classified SSO approval
  through Argus, API Gateway, DynamoDB, and the approval-cookie redemption
  boundary.

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

## QR latency and warmup

- Adapter tests preserve the four-frame encrypted PNG contract while proving
  that native PNG encodes are dispatched concurrently.
- Primer tests prove the expensive renderer refresh is rate-limited per Lambda
  execution environment, shares concurrent attempts, and retries after failure.
- HTTP entrypoint tests prove synthetic heater events warm dependencies without
  entering the API router.
- CDK assertions prove API Gateway and the recurring heater target the same
  `live` alias, with six warmups per minute and the HTTP function's QR-oriented
  memory allocation.
- The deployed smoke gate must still decrypt all four QR frames. After deploy,
  CloudWatch profile events are the source of truth for render and total QR
  latency; API success alone is not a performance assertion.

Still required before cutover:

- Games consumer verification and a real SSO exchange.
- Attack harness probes against the deployed stack for replay, token theft,
  role swapping, downgraded proof, and forged projections.
