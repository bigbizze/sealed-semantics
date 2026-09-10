# Verification coverage

| Contract | Evidence |
| --- | --- |
| Definition identity | Same-label definitions coexist and reject foreign values with specific diagnostics. |
| Semantic identity | Normalized aliases, object keys, allocation, native collections, and retained live values use strict identity. |
| Collision safety | Deliberate collisions throw without revealing Parts; unsupported Parts fail on first decode. |
| Weak cleanup | Deterministic ownership tests protect replacement entries from stale cleanup. |
| Mint events | Each successful mint creates a distinct object. |
| Views | Lazy evaluation, successful caching, retries, deep freezing, readonly types, sealed leaves, and unsafe output rejection. |
| Boundaries | Zod composition, refinements, async paths, implicit serialization rejection, and opaque inspection. |
| Documentation | Typed examples execute at sealing and validate round-trip identity and encoding. |
| Distribution | Installed-tarball tests compile README and inference constraints, exercise separate package copies, and block private imports. |

These checks are evidence for the covered cases, not proof that application producers express the right rules.
