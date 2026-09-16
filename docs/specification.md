# Public contract

The main entry exports `defineSeal` and `defineMint`, plus TypeScript types. `SealedValue<Name>` is the public opaque base type. `SemanticValue` and `MintedValue` also have root exports so inferred consumer declarations can name their types without private module paths. Use `ValueOf<typeof Definition>` for a specific completed definition. The optional Node-only `sealed-semantics/laws` entry exports `assertValueLaws` and `assertMintedLaws`.

## Semantic definitions

`defineSeal({ name, schema, key, allocate?, debug? })` creates a builder. Schema output is private Parts. Schema input must be JSON-compatible and cannot be `any`. The definition name must be a non-empty string literal. Write the name verbatim in the owning module; a path-shaped label such as `app/user-id` is the search string compiler and runtime errors tell callers to grep.

Every semantic definition requires `key(parts)`, returning `string | number | bigint | boolean | null | undefined`. Primitive Parts use an explicit callback too, for example `key: id => id`. Normalize Parts in the schema before computing the key. Different Parts sharing a live key cause a collision error, including primitive Parts.

For every key, the runtime snapshots every decoded Parts graph before computing identity, including the first creation. Supported structures are primitives, dense arrays, plain data objects, and genuine sealed leaves from this installed package copy. The snapshot copies containers, preserves shared acyclic children, preserves sealed leaves by reference, and freezes only the copies it creates. Plain-object snapshot properties are canonicalized before any callback receives them: JavaScript array-index keys appear in numeric order, followed by other string keys in UTF-16 lexical order. Null prototypes and `__proto__` data properties are preserved. Cycles, Dates, collections, array buffers/views, functions, arbitrary class instances, symbol keys, accessors, hidden properties, and other unsupported objects fail. Snapshot failure happens before key evaluation and before intern-table mutation.

Each completed definition owns a private weak table. After Zod normalization and snapshotting, the key selects an existing live instance or a new one. Every live hit also compares the stored snapshot with the new snapshot. Arrays compare in order, plain properties by name independent of insertion order, object and null prototypes remain distinct, and sealed leaves compare by identity. Insertion order is non-semantic because callbacks never receive unsnapshotted plain objects. Alias topology is semantic because callbacks can observe reference equality between child objects. Numeric properties compare with `Object.is`; identity keys also distinguish signed zero and intern NaN with itself. Differing Parts for the same live key throw.

Weak cleanup removes an entry only if it still contains the exact reference associated with the finalized object. Cleanup timing is unspecified. No public control changes interning. This is an identity guarantee, not a speed guarantee.

The completed kind exposes `name`, `is`, `codec`, `assert`, `read`, `debug`, one function per view projection and copy observation, and `allocate` only when configured. Allocation sends its generated input through the same codec and intern table. Zod provides parsing, validation, composition, and encoding. Async schemas use Zod's async APIs; allocation and documentation are synchronous. During encoding, the sealed codec reads the stored frozen Parts snapshot. Zod may validate or copy that value before a schema encoder runs. Encoders must be correct without mutating Parts. TypeScript cannot express this through the external Zod codec type, so runtime freezing remains authoritative for stored Parts.

## Minted definitions

`defineMint({ name, mint, debug? })` creates a builder. The producer returns `ProducerResult<Parts, Error>`. Parts and Error are inferred independently. Error is producer-owned and defaults to `never` for an infallible producer. Failure passes through unchanged. Every success snapshots Parts and creates a fresh instance without an intern table. Mint snapshots use the same canonical plain-object property order as semantic Parts. Invalid successful Parts throw a misuse error before an instance is constructed. The completed definition exposes `name`, `is`, `mint`, `assert`, `read`, `debug`, and one function per view projection and copy observation. `mint` does not automatically assert nested sealed inputs; producers that require genuine leaves call `Kind.assert` themselves.

## Completion

Optional `.view(projections)` returns a builder with that projection map. Optional `.docs(metadata)` and `.copy(observations)` retain the other builder configuration. Every `.seal()` call creates a new frozen definition instance from the captured configuration. Calling `.seal()` recursively during completion fails. There is nothing to publish globally.

A sealed value belongs to exactly one completed definition instance. `is` checks its ES private-field brand and returns a boolean. Definitions with the same label are permitted and unrelated. No global or module-level mutable table tracks names or instances.

Each instance also possesses an ES-private leaf brand shared within this installed package copy. Only that brand authenticates atomic graph leaves. The diagnostic name symbol is separate from authenticity. Rejected sealed-looking objects may come from another installed package copy or may be imitations.

The stateless `Symbol.for('sealed-semantics.name')` protocol reports the label across package copies. It never grants a definition's brand. Foreign codec inputs receive an operation-specific diagnostic. Matching labels explain module re-execution and duplicate package installation as likely causes.

## Instances and kind-side observation

Instances have frozen ordinary surfaces, frozen prototypes, frozen ES private Parts snapshots, and a guarded constructor. They do not expose public `view`, `copy`, or `debug` members. Observation is an operation on the completed kind: `Kind.assert(value)`, `Kind.read(value)`, `Kind.debug(value)`, `Kind.suffix(value)` for each view key, and `Kind.bytes(value)` for each copy key. Each of those functions unseals first or throws. Implicit JSON, numeric, and string conversion throw. Node inspection shows `Sealed<kind>` and, in development, `defined at file:line` relative to the working directory. `Symbol.toStringTag` exposes only the definition name. Runtime errors that name a definition always tell the caller to search for that exact name string. `Defined at` is a development-time pointer only.

`Kind.read(value)` unseals, evaluates every declared projection, and returns the same frozen null-prototype snapshot on later successful calls. A projection that throws leaves no partial public object with the caller; succeeded keys may stay cached. `Kind.suffix(value)` evaluates only that projection. Each projection receives readonly private Parts, then separately validates and snapshots its first successful result before caching it. Already snapshotted library-owned nodes can be reused by reference. Results allow primitives, plain data objects, dense arrays, and sealed leaves. Plain-object view results use the same canonical property order as Parts snapshots. Dates and other classes, collections, array buffers/views, functions, accessors, hidden properties, symbol keys, and cycles are rejected. Validation precedes freezing of newly copied containers. Recursive projection access throws. Failed evaluation or validation does not populate the cache. If `.view()` was omitted or empty, `read` still unseals and returns a frozen empty object.

`DeepReadonly<T>` retains precise nested types and treats sealed types as terminal. Runtime validation remains necessary for class prototypes and descriptors, which TypeScript cannot reliably distinguish from plain data shapes.

Private Parts are frozen snapshots. Producer-owned containers are not frozen and are not retained as private state. Later producer mutations cannot change an existing instance, but later decodes or mint successes use new snapshots. The author still owns semantic correctness, normalization, and domain facts.

## Scope

Identity is local to a completed definition and its JavaScript realm. Encode and decode across worker, server/client, network, or process boundaries. A module re-execution makes new definitions; previous values remain valid only for their original definitions. See [frameworks](frameworks.md).

Builder `.docs()`, `.view()`, and `.copy()` calls may appear in any order. Each retains the other configuration. Final documentation must match the final projections when `.seal()` completes the definition; completed definitions expose no builder methods.

## Owned byte observations

`.copy(observations)` declares kind-side functions. `Kind.bytes(value)` unseals, then on the first successful invocation the producer runs, its output is validated as a genuine Uint8Array, and its bytes are copied into a private snapshot. The producer result never becomes the snapshot and is never returned to a consumer. Every invocation returns a new plain Uint8Array copied from the snapshot. Empty arrays are cached correctly. Failed production or validation retries on the next call; recursive observation access throws. The same string cannot be both a view key and a copy key.

Buffer and cross-realm Uint8Array output qualify as byte input. Only byte contents are copied; subclasses, extra properties, and Buffer methods are not preserved. Shared backing memory and detached storage are rejected through intrinsic checks. Other output types are rejected at compile time where possible and at runtime on access. There is no generic object cloning or public cloning strategy.

The snapshot is private per observation and sealed instance. Consumer writes and later writes to a retained producer result cannot change it. First access costs producer computation plus snapshot copying; every access costs a fresh allocation and byte copy. Snapshots remain while their sealed instances remain reachable.

These guarantees concern storage and observation stability. They do not establish producer purity, absence of side effects, semantic equivalence, correct encoding, or correct units. The author owns those obligations. This facility does not alter Parts, view, codec, or minted identity rules. See [byte observations](bytes.md).
