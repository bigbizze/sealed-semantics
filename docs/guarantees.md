# Guarantees and obligations

`defineKind` establishes that its Zod schema accepted input and produced the private representation.

A minted value establishes that its configured `mint` producer successfully ran on an input and produced this result. It does not establish that the producer’s logic is correct or certify contextual facts such as existence, authorization, currentness, or persistence. The API does not expose mutable access to the result when the producer meets the obligations below.

## What downstream functions can require

A `UserId` establishes that the configured Zod schema or codec accepted its input. A `ProjectId` is a different type. Neither means that a database record exists.

In the consumer example, `PreparedMembership` requires both sealed IDs and checks their brands. `MembershipBatch` then accepts multiple plans, checks that they belong to one project, rejects an empty list, and removes duplicate users. `saveMembershipBatch` requires that batch type. Its caller must have obtained a value accepted by the batch producer, which itself accepted only valid plans.

The type is evidence of a construction path, not a proof that the producer is correct. If a producer omits a rule, the library does not supply it. Application functions exposed to JavaScript or `any` should call the relevant `Kind.is` predicate when they require the runtime guarantee.

## Equality and observation

Two independent parses create two objects. `a === b` is therefore false even when `a.equals(b)` is true. Semantic equality must agree with normalized encoded data; semantic maps and sets use that data as their keys. Minted equality is object identity: minting two plans with equal children still creates two distinct local results.

`view.plans` can return a fresh array containing the same sealed plans. Removing an item from that array changes only the returned copy. Copying the input array protects against edits by the original caller; copying on projection protects against edits by consumers. Neither operation requires cloning the sealed children.

## Public operations

| Location | Operations |
| --- | --- |
| Semantic kind | `is`, `codec`, `map`, `set`; `allocate` only when configured. |
| Minted kind | `mint`, `is`, `map`, `set`. |
| Semantic instance | `equals`, `debug`; `view` only for declared projections. |
| Minted instance | `equals`, `debug`; `view` only for declared projections. |
| View facade | Exactly the declared projection getters, read as properties. |

Kinds also expose their `kind` string and, after `.docs()`, `documentation`. No standard operation is placed inside `view`. There is no public unseal, unwrap, Result helper, or `mintOrThrow` operation.

## Runtime and type identity

Each completed definition creates a class with an ES private field. A private token restricts construction. The class's static block creates private-field inspection closures. Those closures and the class are internal; no package export or kind property exposes them. Recovering the constructor from an instance does not reveal the token. A forged prototype does not pass `Kind.is` or the codec output schema. Prototype identity alone is not validity. Proxies do not inherit the private field.

TypeScript uses an erased brand indexed by the literal kind. Definitions with the same kind have the same erased brand, even though their runtime brands differ. Complete instance types also include view signatures; different configured surfaces can affect assignability. A namespaced literal is required. This is per-kind nominality, not generative type identity. Type assertions, `any`, and JavaScript can bypass static checks; runtime brand checks still apply.

Renaming a kind breaks type identity. The package does not insert it into wire data or collection keys. A consumer makes kind data-bearing only by explicitly including it in an external representation; such a consumer must migrate that data when renaming the kind.

At most one completed definition of a kind may exist in a JavaScript realm. A registry stored on `globalThis` under `Symbol.for('sealed-semantics/kinds')` rejects duplicates synchronously across installed package copies. It stores only names, not definitions or Parts. `.view()` and `.docs()` configure builders and do not register definitions. Calling `.seal()` again on the same builder returns the same kind; sealing a different builder with the same name fails. Separate realms have separate registries; this rule does not claim source-tree uniqueness. Module reloads that complete the same definition again are duplicates. Compiling a file does not execute it; unused modules and separate test processes are not checked together. Collections use the supplied kind and require no shared indexer registry.

## Producer obligations

- the Zod schema/codec and `mint` return a Parts graph for which the producer retains no mutable alias;
- every callback that receives `Parts` treats it as immutable and must not mutate it or
  anything reachable from it. This applies to schema codec encoding, custom `equals`,
  every view projection, and `debug`;
- `view` projections return primitives, sealed values, or fresh copies of anything
  mutable (`bytes.slice()`, `[...list]`, a domain-specific copy function, etc.);
- any custom value returned by a projection that is mutable must likewise be a fresh value
  with no mutable alias back into `Parts`.

Parts are private. A producer can still violate this contract by returning Parts, a mutable child, or a retained alias. The package cannot detect these violations in general. The runtime does not clone, freeze, or traverse Parts. It freezes each instance, its per-definition prototype, and the library-created view facade. These operations do not freeze Parts or prevent private view-cache initialization. Primitives and sealed children can be returned directly. Fresh outer containers must also avoid mutable aliases in their children. A domain copy function must preserve sealed children; `structuredClone` loses their private brands.

Projection return types remain exactly as declared. A mutable copy stays mutable in TypeScript; a producer can explicitly declare a readonly return type. Additional representations can be declared as view projections and need the same copy discipline. Protocol owners must maintain compatibility vectors and select canonical spellings for aliases. Custom equality must agree with encoded JSON key equality. The law harness checks samples; it cannot prove exclusive ownership or the absence of producer mutation for all inputs.

## JSON boundary

RawWire must be a TypeScript JSON structural type. At runtime it must consist of strings, finite numbers, booleans, null, dense arrays, and plain objects with enumerable string data properties. Null-prototype objects are accepted. Accessors, hidden properties, symbol keys, functions, undefined, bigints, dates, typed arrays, cycles, sparse arrays, and extra array properties are not JSON wire data. Repeated acyclic references are allowed. Internal keying validates this domain recursively and throws `TypeError` for violations. Object keys sort lexicographically; array order and JSON string escaping are preserved. Negative zero encodes as `-0`, not `0`. Projection output is not restricted to JSON.

`z.encode(Kind.codec, value)` uses backward Zod encoding. Composite contracts emit fully raw data. One-way transforms cannot encode backward; use codecs for conversions. Zod owns boundary validation and errors, including async variants. Allocation and executable docs use synchronous parsing; schemas with async work require explicit async Zod calls instead. Mint callbacks are synchronous and return `ProducerResult`; throwing is not an input-rejection result. An allocator produces raw input and returns the codec-parsed value, throwing a Zod error for invalid input.

Instances reject implicit string conversion, numeric conversion, and JSON serialization with the specified TypeError. Object spread produces an empty object. Structured cloning produces an unbranded object. The instance cannot gain own properties or change its prototype. Its per-definition prototype is frozen after all methods are installed. Attempts to replace or remove its methods fail. This does not make JavaScript intrinsics or producer code a security sandbox.

## Definition completion and configuration

The staged builder is the inference-gate revision described in `viability.md`. Call `.seal()` to complete a definition; only this step reserves the kind and creates its runtime identity. Projection names that conflict with kind operations, prototype behavior, or forbidden accessors are rejected. Builders are immutable: `.view(...)` replaces the projection map in a new builder, and `.docs(...)` returns a new builder carrying metadata. Configure projections before documentation. Completed kinds expose no configuration methods. The runtime captures callbacks at definition time. Do not mutate the Zod schema or definition after setup.

The physical source-line limit is removed. Source is formatted normally with Prettier and checked by `format:check`; no source-size gate rewards compressing statements. The README checker verifies local links and code fences; it does not impose a line limit. Zod is the required runtime peer. fast-check ^4.9.0 is an optional peer used only by the public Node-only laws entry; ordinary main-entry consumers do not need it. Consumers of the law harness install it as a development dependency.

Definition objects and options must use known, enumerable string data properties. The runtime checks required callbacks, configured optional callbacks, projection functions, and the wire schema before registering a kind. Unknown keys, malformed callbacks, symbols, hidden properties, and accessors fail with descriptive TypeErrors. This validates configuration shape, not callback behavior or whether a callback will throw for some future input.

Semantic coercion errors recommend `z.encode(Kind.codec, value)` or encoding the enclosing contract. Minted coercion errors say `<kind> has no external representation and cannot be serialized`; they never recommend an unavailable encode() method.

## Amended instance surface

Declared `view` projections become read-only getter properties under `value.view`. A non-enumerable prototype getter validates the actual private brand and lazily constructs a stable, frozen, null-prototype facade. Only declared string-named getters are exposed; each reads the originating sealed value. Each read invokes the projection again, allowing fresh copies. The cache is an ES private field, not an own public property. An empty or absent view produces no view member.

All standard top-level API names and forbidden generic access names are reserved inside view. Diagnostics name the invalid configured field and explain that another projection name is required. Old kind-level projections and canonical methods are removed. Both kinds expose map/set factories. Collection constructors are internal; consumers can import ValueMap and ValueSet only as types.

View getters should perform cheap observations or copies. Getter results are not cached. Expensive computation should be an explicitly named operation outside the facade. Frozen facade descriptors do not imply frozen projection outputs.

Default semantic equality, semantic collections, executable docs, allocation, and the law harness require synchronous bidirectional schema operations. Zod async parsing can still create branded values from async refinements, but it does not make those synchronous operations async.
