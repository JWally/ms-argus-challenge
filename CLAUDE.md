# Repository operating notes

Read `/home/justin/Dev/ARGUS_ENGINEERING_GUIDE.md` before changing code.

This is a contract-first replacement for `ms-argus-pair`. Do not weaken or
silently reinterpret a public contract to simplify an implementation. Update the
compatibility matrix and add a failing contract test before changing protocol
behavior.

Use the following dependency direction:

```text
contracts <- core <- adapters <- entrypoints/infrastructure
```

Browser entrypoints may depend on contracts, but never on server adapters or
infrastructure. Lambda handlers parse transport events, call an application use
case, and serialize the result. They do not own policy.

The only supported public contract is the latest Pair contract. Do not add v1,
v2, deprecated route aliases, or speculative compatibility branches.

Run `npm run quality` before considering a change complete. Live tests require
explicit `CHALLENGE_E2E_*` environment variables and must never point at
production by default.
