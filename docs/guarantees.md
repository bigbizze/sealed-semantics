# Guarantees and obligations

Zod controls representation boundaries. `defineKind` creates semantic values whose value identity is JavaScript reference identity within one definition instance. `defineMinted` creates values whose identity is the successful mint event. `view` exposes stable immutable observations. The package holds no global state.

## Construction and identity

A sealed value belongs to exactly one completed definition instance. `Kind.is(value)` is true only for values produced by that instance. Two definitions may use the same kind string. They are unrelated, and values of one are not values of the other.

Semantic decoding validates and normalizes input before computing identity. Equivalent live values are the same object. Native `Map` and `Set` therefore work. An existing live value cannot be displaced by another parse. Minting never interns; every success is a new event.

Forged prototypes, recovered constructors, proxies, casts, and structured clones do not acquire the definition's private brand. A cast can bypass TypeScript, so JavaScript-facing functions should check `Kind.is` where they require a particular definition.

TypeScript cannot mint a fresh nominal type for each factory call. The declaration brand uses the literal label to distinguish ordinary definitions statically. Same-label definitions can have compatible static types. The runtime private brand, not the label, establishes membership.

## Producer obligations

A schema establishes only its configured contract. A UserId does not prove database existence. A successful mint does not prove producer correctness, authorization, persistence, or currentness.

Normalize Parts before computing an explicit key. The key is identity, not a collision-tolerant hash. Different canonical Parts for the same live key throw with the label and key. Key strings can contain sensitive data, so choose diagnostic-safe keys when that matters.

Keyed Parts permit primitives, dense arrays, plain data objects, Dates, and sealed leaves. They reject unsupported graphs on first decode. Dates compare by timestamp and remain logically immutable. Views cannot expose a Date; expose a timestamp or string instead.

The library does not deep-freeze all private Parts merely because they are sealed. Anything exposed through `view` becomes deeply immutable. Parts must remain logically immutable after sealing. Copy caller-owned mutable containers before retaining them. Do not mutate retained aliases, the schema, or callback behavior after completion.

Do not pass adversarial proxies or objects that impersonate the stateless sealed-leaf protocol as trusted producer output. Browser JavaScript has no general proxy detector. This package is not a sandbox against malicious producer code or changes to JavaScript intrinsics.

## Observations and logging

Views are lazy and separately cached. Successful results are stable and deeply frozen. Sealed leaves retain their original identity and are not recursively frozen. Unsupported structures and cycles throw on first access. Shared acyclic structures work. If evaluation fails, later access retries.

Explicit debug callbacks may reveal information chosen by the producer. Console inspection does not call them or encode Parts. It displays `Sealed<kind>`. JSON and structured logging must explicitly encode semantic values through Zod. Minted values have no external representation.

Use `===`, Node strict equality assertions, or Jest/Vitest `toBe` for identity. Enumerable deep comparison can mistake two different mint events for equal objects.

## Boundaries and module re-execution

Values do not retain object identity across Web Workers, worker_threads, iframe realms, Node vm contexts, processes, network, or storage. Transfer Zod-encoded external data and decode with the receiving definition.

A module re-execution creates new definitions. Existing values still work but are foreign to the new definitions. Their codecs report whether the foreign value has the same label or a different kind. Matching labels suggest hot reload, test isolation, or multiple package copies. See [framework guidance](frameworks.md).

## Runtime requirements

The core requires `WeakRef` and `FinalizationRegistry`. Import throws a clear error if either is unavailable. There is no strong-reference fallback or opt-out. Finalization timing is nondeterministic; dead entries can remain until cleanup runs.

Cloudflare enables these facilities by default for compatibility dates from 2025-05-05. If disabled, enable `enable_weak_ref` and remove `disable_weak_ref`. [Cloudflare compatibility documentation](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#enable-finalizationregistry-and-weakref)

Only the laws entry imports Node facilities and fast-check. The core uses browser-compatible JavaScript and the Zod peer dependency.
