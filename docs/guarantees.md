# Guarantees and obligations

`defineValue` certifies that a producer accepted a value under its grammar and normalization rules. `defineDerived` certifies that its producer ran on the supplied input and transferred ownership of its result. The API does not expose mutable access to that result when the producer meets the obligations below. Neither constructor certifies existence, membership, permission, currentness, storage success, or transaction state.

## Runtime and type identity

Each completed definition creates a class with an ES private field. A private token restricts construction. The class's static block creates private-field inspection closures. Those closures and the class are internal; no package export or kind property exposes them. Recovering the constructor from an instance does not reveal the token. A forged prototype does not pass `Kind.is` or the codec output schema. Prototype identity alone is not validity. Proxies do not inherit the private field.

TypeScript uses an erased brand indexed by the literal kind. Definitions with the same kind have the same erased brand, even though their runtime brands differ. Complete instance types also include wire, canonical, and view signatures; different configured surfaces can affect assignability. A namespaced literal is required. This is per-kind nominality, not generative type identity. Type assertions, `any`, and JavaScript can bypass static checks; runtime brand checks still apply.

Renaming a kind breaks type identity. The package does not insert it into wire data, canonical data, or collection keys. A consumer makes kind data-bearing only by explicitly including it in an external representation; such a consumer must migrate that data when renaming the kind.

The duplicate-kind Set is a diagnostic within one installed copy. It stores only strings, not definitions or indexers. Run `check-kinds` over all owned source roots in CI for cross-copy duplicates. Collections use the supplied kind's public `is`, `parse`/`wire` shape, and the sealed value's explicit encoding. No single-copy package requirement is imposed.

## Producer obligations (verbatim from revision 5)

- `decode` and `derive` return a `Parts` graph for which the producer retains no mutable alias;
- every callback that receives `Parts` treats it as immutable and must not mutate it or
  anything reachable from it. This applies to `toWireShape`, custom `equals`, `canonical`,
  every field projection, and `debug`;
- `fields` and `canonical` return primitives, sealed values, or fresh copies of anything
  mutable (`bytes.slice()`, `[...list]`, a domain-specific copy function, etc.);
- any custom value returned by a projection that is mutable must likewise be a fresh value
  with no mutable alias back into `Parts`.

Parts are private. A producer can still violate this contract by returning Parts, a mutable child, or a retained alias. The package cannot detect these violations in general. The runtime does not clone, freeze, or traverse Parts. It freezes each instance, its per-definition prototype, and the library-created view facade. These operations do not freeze Parts or prevent private view-cache initialization. Primitives and sealed children can be returned directly. Fresh outer containers must also avoid mutable aliases in their children. A domain copy function must preserve sealed children; `structuredClone` loses their private brands.

Projection return types remain exactly as declared. A mutable copy stays mutable in TypeScript; a producer can explicitly declare a readonly return type. Canonical representations are caller-defined and need the same copy discipline. Protocol owners must maintain compatibility vectors and select canonical spellings for aliases. Custom equality must agree with encoded JSON key equality. The law harness checks samples; it cannot prove exclusive ownership or the absence of producer mutation for all inputs.

## JSON boundary

RawWire must be a TypeScript JSON structural type. At runtime it must consist of strings, finite numbers, booleans, null, dense arrays, and plain objects with enumerable string data properties. Null-prototype objects are accepted. Accessors, hidden properties, symbol keys, functions, undefined, bigints, dates, typed arrays, cycles, sparse arrays, and extra array properties are not JSON wire data. Repeated acyclic references are allowed. Internal keying validates this domain recursively and throws `TypeError` for violations. Object keys sort lexicographically; array order and JSON string escaping are preserved. Negative zero encodes as `-0`, not `0`. Canonical output is not restricted to JSON.

`encode()` uses backward Zod encoding. Composite codecs therefore emit fully raw data. A forward-only Zod transform cannot encode backward; use a codec. Schemas and producers must be synchronous for the Result acquisition API. Async callbacks and throwing producer callbacks are specification errors, not invalid-input Results. `decode` and `derive` must return `err(ValueError)` for input rejection. An allocator whose arguments can be invalid should return raw data that the wire schema rejects. `parse` returns `invalid_wire` for wire rejection and preserves a decode error object. Zod codec rejection becomes a custom issue. Programming errors can throw even on Zod safe paths.

Instances reject implicit string conversion, numeric conversion, and JSON serialization with the specified TypeError. Object spread produces an empty object. Structured cloning produces an unbranded object. The instance cannot gain own properties or change its prototype. Its per-definition prototype is frozen after all methods are installed. Attempts to replace or remove its methods fail. This does not make JavaScript intrinsics or producer code a security sandbox.

## Builder and size

The staged builder is the inference-gate revision described in `viability.md`. Call `.with(...)` to complete a definition; only this step reserves the kind and creates its runtime identity. Projection names that conflict with kind operations, prototype behavior, or forbidden accessors are rejected. The runtime captures callbacks at definition time. Do not mutate the Zod schema or definition after setup.

The physical source-line limit is removed. Source is formatted normally with Prettier and checked by `format:check`; no source-size gate rewards compressing statements. The README keeps its separate under-150-line requirement. Zod is the required runtime peer. fast-check ^4.9.0 is an optional peer used only by the public Node-only laws entry; ordinary main-entry consumers do not need it. Consumers of the law harness install it as a development dependency.

Definition objects and options must use known, enumerable string data properties. The runtime checks required callbacks, configured optional callbacks, field functions, and the wire schema before registering a kind. Unknown keys, malformed callbacks, symbols, hidden properties, and accessors fail with descriptive TypeErrors. This validates configuration shape, not callback behavior or whether a callback will throw for some future input.

Semantic coercion errors recommend explicit encoding. Derived coercion errors say `<kind> has no external representation and cannot be serialized`; they never recommend an unavailable encode() method.

## Amended instance surface

`canonical()` is an instance method only when configured. Declared `fields` become zero-argument functions under `value.view`. A non-enumerable prototype getter validates the actual private brand and lazily constructs a stable, frozen, null-prototype facade. Only declared string-named functions are exposed; each is bound to the originating sealed value. The cache is an ES private field, not an own public property. Empty or absent fields produce no view member. Canonical alone does not produce a view.

All standard top-level API names and forbidden generic access names are reserved inside fields. Diagnostics name the invalid configured field and explain that another projection name is required. Old kind-level projections and canonical methods are removed. Both kinds expose map/set factories. Collection constructors are internal; consumers can import ValueMap and ValueSet only as types.
