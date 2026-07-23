# ADR 0001: Feature-oriented modular monolith

Status: accepted

Challenge has multiple runtime entrypoints but one cohesive security protocol.
Keeping them in one repository makes contract changes atomic. Ports keep domain
logic independently testable and prevent AWS mechanics from becoming policy.

We will not split into microservices unless an independently scaled or owned
boundary appears in measured operation. We will not organize runtime code under
CDK or use generic handler/helper/service buckets.
