# Operations

Challenge deploys beside Pair. It does not own or alter the current Pair domains
until compatibility, soak, and rollback gates are complete.

The isolated development stack is `ms-argus-challenge-dev-jw` and its public
origin is `https://challenge-dev-jw.argus.pw`. It has its own CloudFront
distribution, S3 bucket, HTTP API, WebSocket API, DynamoDB table, Secrets
Manager keys, logs, and alarms. It has no WAF association.

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

## Cutover prerequisites

- Compatibility matrix complete.
- Games consumer contract suite green.
- Existing sessions drained or signing/session continuity explicitly planned.
- CloudFront and DNS rollback tested.
- Dashboards and alarms quiet through the agreed soak interval.

Until cutover, rollback is simply leaving merchant scripts on Pair. Challenge
does not share Pair session state, signing keys, hostnames, or DNS records.
