# Verification coverage

The current implementation uses Zod as the sole semantic boundary API. The [specification](specification.md) describes the current contract.

| Contract | Verification |
| --- | --- |
| Private identity and restricted construction | Runtime tests reject forged prototypes, proxies, recovered constructors, and cloned objects. |
| Schema-only inference and removed APIs | Inference checks verify precise codec inputs and outputs, projected Parts, distinct kinds, and rejected legacy calls. |
| Boundary composition and normalization | Runtime and consumer tests parse and encode nested contracts, normalize aliases, and reject invalid codec output. |
| Frozen public surfaces | Tests check kinds, builders, instances, prototypes, view facades, and private lazy caching. |
| Unique kind names | Runtime and installed-package tests cover duplicate completion and independent package copies. |
| Semantic and minted collections | Tests cover normalized keys, identity keys, original key retention, iteration, deletion, and detached entries. |
| Docs | Sealing tests cover every example, input rejection, encoding drift, complete view descriptions, and malformed metadata. |
| Projection ownership | Laws cover mutable aliases, frozen outer containers, functions, accessors, custom mutators, and sealed children. |
| Consumer ergonomics | The standalone consumer compiles against installed declarations and runs a fake HTTP and database lifecycle. |
| Distribution | Package smoke tests install the tarball, compile README and negative constraints, check optional peers, and block private imports. |

These tests are evidence for the covered cases, not proof of producer correctness. See [guarantees](guarantees.md) for producer obligations.
