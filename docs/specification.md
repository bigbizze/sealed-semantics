# Public contract

The main entry exports `defineSeal` and `defineMint`, plus TypeScript types. The optional Node-only `sealed-semantics/laws` entry exports `assertValueLaws` and `assertMintedLaws`.

## Semantic definitions

`defineSeal({ name, schema, key, allocate?, debug? })` creates a builder. Schema output is private Parts. Schema input must be JSON-compatible and cannot be `any`. The definition name must be a non-empty string literal.

Every semantic definition requires `key(parts)`, returning `string | number | bigint | boolean | null | undefined`. Primitive Parts use an explicit callback too, for example `key: id => id`. Normalize Parts in the schema before computing the key. Different Parts sharing a live key cause a collision error, including primitive Parts.

For every key, the runtime validates every decoded Parts graph before computing identity, including the first creation. Supported structures are primitives, dense arrays, plain data objects, Dates without own properties, and sealed leaves. Cycles, symbol keys, accessors, hidden properties, and other objects fail. Shared acyclic subgraphs are allowed.

Each completed definition owns a private weak table. After Zod normalization, the key selects an existing live instance or a new one. Every live hit must also pass structural collision comparison. Arrays compare in order, plain properties by name independent of insertion order, Dates by timestamp, and sealed leaves by identity. Numeric properties compare with `Object.is`; identity keys also distinguish signed zero and intern NaN with itself. Differing Parts for the same live key throw.

Weak cleanup removes an entry only if it still contains the exact reference associated with the finalized object. Cleanup timing is unspecified. No public control changes interning. This is an identity guarantee, not a speed guarantee.

The completed kind exposes `name`, `is`, `codec`, and `allocate` only when configured. Allocation sends its generated input through the same codec and intern table. Zod provides parsing, validation, composition, and encoding. Async schemas use Zod's async APIs; allocation and documentation are synchronous.

## Minted definitions

`defineMint({ name, mint, debug? })` creates a builder. The producer returns `ProducerResult<Parts, Error>`. Parts and Error are inferred independently. Error is producer-owned and defaults to `never` for an infallible producer. Failure passes through unchanged. Every success creates a fresh instance without an intern table. The completed definition exposes `name`, `is`, and `mint`.

## Completion

Optional `.view(projections)` returns a builder with that projection map. Optional `.docs(metadata)` follows views. Every `.seal()` call creates a new frozen definition instance from the captured configuration. Calling `.seal()` recursively during completion fails. There is nothing to publish globally.

A sealed value belongs to exactly one completed definition instance. `is` checks its ES private-field brand and returns a boolean. Definitions with the same label are permitted and unrelated. No global or module-level mutable table tracks names or instances.

Each instance also possesses an ES-private leaf brand shared within this installed package copy. Only that brand authenticates atomic graph leaves. Other package copies and objects mimicking a label are rejected by graph validation.

The stateless `Symbol.for('sealed-semantics.name')` protocol reports the label across package copies. It never grants a definition's brand. Foreign codec inputs receive an operation-specific diagnostic. Matching labels explain module re-execution and duplicate package installation as likely causes.

## Instances and views

Instances have frozen ordinary surfaces, frozen prototypes, ES private Parts, and a guarded constructor. Standard observations are explicit `debug()` and optional `view`. Implicit JSON, numeric, and string conversion throw. Node inspection and `Symbol.toStringTag` expose only the definition name.

The view facade is lazy, frozen, and null-prototype. Each projection separately validates, deeply freezes, and caches its first successful result. Results allow primitives, plain data objects, dense arrays, and sealed leaves. Dates and other classes, functions, accessors, hidden properties, symbol keys, and cycles are rejected. Validation precedes any freezing. Recursive projection access throws. Failed evaluation or validation does not populate the cache.

`DeepReadonly<T>` retains precise nested types and treats sealed types as terminal. Runtime validation remains necessary for class prototypes and descriptors, which TypeScript cannot reliably distinguish from plain data shapes.

Private Parts are logically immutable. The library does not freeze all Parts at construction, but it freezes any graph exposed through a view. Producers must own or copy mutable inputs and must not mutate them later.

## Scope

Identity is local to a completed definition and its JavaScript realm. Encode and decode across worker, server/client, network, or process boundaries. A module re-execution makes new definitions; previous values remain valid only for their original definitions. See [frameworks](frameworks.md).

Builder `.docs()` and `.view()` calls may appear in either order. Both retain the other configuration. Final documentation must match the final projections when `.seal()` completes the definition; completed definitions expose no builder methods.
