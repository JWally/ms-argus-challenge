# Architecture

## Decision

Challenge is a feature-oriented modular monolith with multiple deployable
entrypoints. A single repository owns one cohesive security protocol, while
domain policy remains independent from AWS and browser transports.

```text
Merchant page -> loader -> embedded web app -> HTTP application
                                      |             |
Mobile browser -> drawing board ------+             +-> session store
                                      |             +-> Argus projections
Desktop/mobile <------ WebSocket -----+             +-> verdict signer
```

## Modules

`contracts` owns stable external shapes. Schemas validate untrusted values at
the edge and derive TypeScript types from the same definitions.

`core` owns pairing, assurance, proof, SSO, token, and verdict workflows. It
depends on ports for clocks, identifiers, persistence, projections, secrets,
and event publication.

`adapters` implements those ports with DynamoDB, Secrets Manager, API Gateway,
and the Argus merchant-projection API.

`apps` contains the HTTP Lambda, WebSocket Lambda, web application, and loader.
Entrypoints perform transport conversion and dependency composition only.

`infrastructure` creates deployable AWS resources and passes configuration to
entrypoints. Runtime code never lives under the infrastructure directory.

## Web application model

The browser app applies the same dependency rule at a smaller scale:

```text
main/routes -> pages/controllers -> feature use cases and views
                                  -> shared browser adapters
                                  -> reusable components
```

- `pages` are route entrypoints. They read route state, compose feature APIs,
  and select a view; they do not own assurance or protocol policy.
- `features/<capability>` keeps each vertical slice together. Pure state and
  presentation mappings are tested without a browser, while hooks coordinate
  effects and feature views render the result.
- `shared` implements browser-specific ports such as HTTP, Argus scans,
  WebSocket, passkeys, Google proof, deadlines, and device trust.
- `components` contains feature-independent visual primitives only.
- `styles` is split by surface with one token layer instead of a global
  catch-all stylesheet.

Dependency-cruiser ratchets this direction: shared code and reusable components
cannot reach into features or pages, and features cannot reach back into route
pages.

## Trust boundaries

- Browser result messages contain only the session identifier and server-signed
  token. Client-decided verdict and reason fields do not cross into the
  merchant page.
- Browser messages are delivery notifications, never merchant proof.
- Merchant servers verify verdict tokens through `/api/verify`.
- Session identifiers, challenge identifiers, participant roles, and nonces are
  stored and enforced by the server. Verdict tokens bind the exact scoped CPI
  requested at session start; a merchant-owned minimum-scope policy remains
  required before the server can independently reject assurance downgrades.
- Every Pair and SSO scan must expose a verified Argus cryptographic identity
  whose API projection device id matches the exact public-key string that
  signed that Challenge attestation. A clean projection from a different
  device therefore fails before a paired verdict or SSO approval is minted.
- Pair-token redemption and SSO approval exchange are single-use.
- Missing projection, binding, proof, or signing material fails closed.
- Polling can recover delivery but cannot bypass WebSocket authentication.
