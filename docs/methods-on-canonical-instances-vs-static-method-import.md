# Methods on instances versus a separate codec import

A separately imported free `encode(v)` could define a region that can hold and compare values but cannot render them. An instance method travels with the value, so import rules cannot enforce that region.

This package uses instance methods. A value that can be hashed must be renderable wherever hashing occurs, and hashing is domain work. A render-free region is rare in practice. If the codec entry can be imported from application internals, the boundary becomes a naming convention. Requiring `Kind.wire.encode(v)` at every crossing adds no enforceable restriction in that case.

Every rendering still requires a named, deliberate call. Implicit coercion and generic serialization cannot yield a valid representation. Per-kind text searches no longer find every crossing; a type-aware lint rule on `.encode()` receivers could restore that check when tooling supports it.

The RawWire/DecodedWire split gives `encode()` one precise meaning: the complete external representation, including backward encoding of nested sealed values. This supports placing that operation on the instance.

Revisit a separate free-function entry only for a codebase with an enforceable render-free region. Do not add it speculatively.

The accepted amendments also put optional canonical() on the instance and custom field observations under view. These operations travel with the value. Kinds produce and recognize values and provide typed collection factories. The view namespace makes custom observations identifiable without adding domain-specific names to the standard top-level method surface.
