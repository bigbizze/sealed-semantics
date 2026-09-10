# Configuration diagnostics

Public types expose only configured capabilities. Generic checks explain invalid supplied keys without adding impossible properties to normal autocomplete.

- An unfinished `ValueOf` asks for `.seal()`.
- Object Parts require `key(parts)`. Primitive Parts reject a custom key.
- Keys must return supported primitives. A symbol or object is invalid.
- Completed definitions expose only their construction operations and codec, where applicable.
- View results preserve their inferred shape but become deeply readonly. Known unsupported results get a configuration diagnostic. Runtime validation checks prototypes and descriptors on first access.
- Documentation requires typed input/output examples and exact projection descriptions.
- Law options include allocation generators only when allocation is configured.

Configuration rejects unknown keys, accessors, hidden properties, symbol keys, and malformed callbacks. A kind label must be a non-empty string literal.

Foreign codec values report the receiving definition and attempted operation. A matching label explains that module re-execution or duplicate installation may have created another definition instance. `is()` remains a boolean predicate.
