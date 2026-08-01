# Operations

Challenge deploys beside Pair. It does not own or alter the current Pair domains
until compatibility, soak, and rollback gates are complete.

The isolated development stack is `ms-argus-challenge-dev-jw` and its public
origin is `https://challenge-dev-jw.argus.pw`. It has its own CloudFront
distribution, S3 bucket, HTTP API, WebSocket API, DynamoDB table, Secrets
Manager keys, logs, and alarms. It has no WAF association.

The HTTP API routes through a versioned `live` Lambda alias. A one-minute
EventBridge rule invokes a small heater which targets that same alias six times,
ten seconds apart. Warmups initialize runtime secrets, touch the session store,
and refresh the native four-frame QR encoder on each ten-second heater pass.
Concurrent warmups share the same render, and a five-second minimum interval
prevents duplicate work. This is warm capacity, not provisioned concurrency.

QR mints emit `pair_token_qr_profile` JSON records with total, render, packing,
sealing, and per-frame encoding timings. HTTP access records include integration
and response latency. Use those fields rather than whole-function duration when
diagnosing QR regressions, because the HTTP Lambda serves every Challenge route.

## Deployment gates

1. `npm run quality`
2. Review `npm run cdk:diff` when ownership or resources change.
3. Run `npm run deploy:dev`.
4. The deploy command reads current merchant/SSO configuration from the
   isolated Pair Lambda unless explicit environment overrides are supplied; it
   never writes those values to disk or output.
5. The command derives the deployed stack outputs and runs the live AWS suite.
6. The command runs Chromium against the public hostname and fails if the
   loader or encrypted-QR flow does not work.

Supported deployment overrides are documented in `.env.example`. Do not commit
real credentials.

## Dependency audit policy

<!-- cspell:ignore GHSA qwww -->

`npm run quality` includes the moderate-or-higher dependency audit used by CI.
The gate fails closed for malformed audit output, unresolved advisory chains,
and every finding except
[`GHSA-qwww-vcr4-c8h2`](https://github.com/advisories/GHSA-qwww-vcr4-c8h2).

That temporary exception is limited to `react-router` and expires on October 1, 2026. The advisory applies to React Server Component APIs; Challenge is a
browser-only SPA that uses the stable client router and does not ship React
Server Components or server actions. Upgrade to a patched React Router release
and remove the exception as soon as one is published. A different advisory,
package, or expired exception still fails the build.

## Cutover prerequisites

- Compatibility matrix complete.
- Games consumer contract suite green.
- Existing sessions drained or signing/session continuity explicitly planned.
- CloudFront and DNS rollback tested.
- Dashboards and alarms quiet through the agreed soak interval.

Until cutover, rollback is simply leaving merchant scripts on Pair. Challenge
does not share Pair session state, signing keys, hostnames, or DNS records.
