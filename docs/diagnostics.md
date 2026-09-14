# Configuration diagnostics

Public types expose only configured capabilities. Generic checks explain invalid supplied keys without adding impossible properties to normal autocomplete.

- An unfinished `ValueOf` asks for `.seal()`.
- Every semantic definition requires `key(parts)`, including primitive Parts.
- Keys must return supported primitives. A symbol or object is invalid.
- Completed definitions expose only their construction operations and codec, where applicable.
- Key, debug, view, and copy callbacks receive `DeepReadonly<Parts>`.
- Schema outputs and successful mint Parts reject identifiable unsupported types such as Dates, collections, array buffers/views, functions, promises, and symbol-keyed object shapes. Runtime validation remains authoritative for prototypes, accessors, hidden properties, symbol keys TypeScript cannot see, and cycles.
- View results preserve their inferred shape but become deeply readonly. Known unsupported results get a configuration diagnostic. Runtime validation checks prototypes and descriptors on first access.
- Documentation requires typed input/output examples and exact projection descriptions.
- Law options include allocation generators only when allocation is configured.

Configuration rejects unknown keys, accessors, hidden properties, symbol keys, and malformed callbacks. A definition name must be a non-empty string literal.

Foreign codec values report the receiving definition and attempted operation. A matching label explains that module re-execution or duplicate installation may have created another definition instance. Rejected sealed-looking graph leaves explain that they may be package-copy values or imitations. `is()` remains a boolean predicate.

`Proof<Name>` carries a default type argument that tells agents not to cast, to grep the definition name, and to construct through `.codec.parse()` or `.mint()`. `ValueOf<typeof Kind>` still prints as `Proof<"the/name", "sealed value: ...">` for ordinary seals, so the compiler error names the search string. Runtime errors and Node inspection include that same name and `Defined at file:line` captured when `defineSeal` or `defineMint` ran. See [agent instructions](AGENTS.md).
