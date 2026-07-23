# Pair compatibility matrix

The old implementation is a behavioral oracle during construction, not a code
architecture template. Each row requires black-box parity before domain cutover.

## Current gate status

| Gate                                                       | Status      |
| ---------------------------------------------------------- | ----------- |
| Latest browser and HTTP contract implemented               | Complete    |
| Unit, integration, architecture, build, and coverage gates | Passing     |
| Isolated AWS HTTP/WebSocket/Dynamo/worker E2E              | Passing     |
| Isolated live Chromium loader and encrypted-QR E2E         | Passing     |
| Pair-versus-Challenge differential suite                   | Pending     |
| Physical desktop-to-phone drawing flow                     | Pending     |
| Real Google SSO round trip                                 | Pending     |
| Games consumer verification and cutover                    | Not started |

The unchecked rows below are cutover evidence, not an implementation to-do
list. Challenge exposes the complete latest contract, but it does not claim
production parity until the same black-box case passes against Pair and
Challenge.

## Intentional result-callback hardening

Challenge deliberately narrows Pair's browser result callback from
`{sessionId, verdict, reason, token}` to `{sessionId, token}` and requires a
non-empty server token. This is a security contract change: a merchant page can
no longer mistake the client-decrypted verdict for authorization.

Known consumers already gate on the token, but Pair-versus-Challenge
differential testing must treat the omitted fields as an approved divergence.
Pair should adopt the same token-only callback before the old implementation is
retired.

## Browser contract

- [ ] `window.argusCaptcha.render(element, options)`
- [ ] `window.argusCaptcha.startMobileSso(options)`
- [ ] automatic `.argus-captcha` mounting
- [ ] loader data attributes and explicit embed-origin override
- [ ] `/embed`, `/pair/:sessionId`, `/p/:token`, and `/sso/mobile` routes
- [ ] token-only `argus-captcha` result plus size, status, and telemetry messages
- [ ] `argus-captcha-host` viewport message
- [ ] drawing-board challenge only; no dial pad or alternate challenge fallback

## HTTP routes

- [ ] `POST /api/session/start`
- [ ] `POST /api/sso/start`
- [ ] `POST /api/sso/{id}/challenge`
- [ ] `POST /api/sso/{id}/validate`
- [ ] `POST /api/sso/approval/redeem`
- [ ] `POST /api/sso/approval/exchange`
- [ ] `GET /api/session/{id}/info`
- [ ] `GET /api/session/{id}/verdict-token`
- [ ] `POST /api/verify`
- [ ] `POST /api/session/{id}/pair-token`
- [ ] `POST /api/pair-token/redeem`
- [ ] `POST /api/phone-perf`
- [ ] `POST /api/sso/telemetry`
- [ ] `POST /api/session/{id}/desktop-attest`
- [ ] `POST /api/session/{id}/phone-attest`
- [ ] `GET /api/session/{id}/result`
- [ ] JSON fallback for unmatched `/api/{proxy+}` routes

## Security and transport

- [ ] `.fastpass`, `.stepup`, `.forceauth`, and unscoped CPI semantics
- [ ] challenge/CPI-bound verdict tokens and `/api/verify`
- [ ] short, single-use pair-token mint and redemption
- [ ] role-bound WebSocket bootstrap and authenticated peer relay
- [ ] desktop reveal gating and authenticated polling recovery
- [ ] desktop and phone projection claims
- [ ] verified projection-to-attestation key continuity on Pair and every SSO leg
- [ ] proof-of-life, passkey, device trust, and OAuth assurance
- [ ] host preflight and worker-integrity enforcement
- [ ] SSO return-origin allowlist and single-use approval exchange
- [ ] rate limits, replay rejection, expiry, CORS, and response headers

There is intentionally no v1 or v2 compatibility layer.
