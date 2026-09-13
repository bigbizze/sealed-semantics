# Verification coverage

| Contract | Evidence |
| --- | --- |
| Definition identity | Same-label definitions coexist and reject foreign values with specific diagnostics. |
| Semantic identity | Normalized aliases, object keys, allocation, native collections, and retained live values use strict identity. |
| Collision safety | Deliberate collisions throw without revealing Parts; unsupported Parts fail before key evaluation. |
| Weak cleanup | Deterministic ownership tests protect replacement entries from stale cleanup. |
| Mint events | Each successful mint snapshots Parts and creates a distinct object; failures pass through unchanged. |
| Parts snapshots | Caller containers, retained aliases, shared children, null prototypes, `__proto__` data, and sealed leaves are covered. |
| Views | Lazy evaluation, successful snapshot caching, retries, deep freezing, readonly types, sealed leaves, and unsafe output rejection. |
| Boundaries | Zod composition, refinements, async paths, implicit serialization rejection, and opaque inspection. |
| Documentation | Typed examples execute at sealing and validate round-trip identity and encoding. |
| Distribution | Installed-tarball tests compile README and inference constraints, exercise separate package copies, and block private imports. |

These checks are evidence for the covered cases, not proof that application producers express the right rules.
