# Current API specification

The package exposes `defineKind` and `defineMinted`. Zod owns validation, parsing, decoding, encoding, composition, and boundary errors. The package owns private runtime identity, controlled construction, projections, equality, collections, documentation, and property laws.

## Semantic kinds

```ts
const Id = defineKind({
  kind: 'app/id',
  schema: z.string().min(1),
})
  .view({ length: text => text.length })
  .docs({
    examples: [{ input: 'abc', encoded: 'abc' }],
    view: { length: { description: 'Identifier length.', example: 3 } },
  })
  .seal();
```

The required declaration properties are `kind` and `schema`. Optional properties are `equals`, `debug`, and `allocate`. `kind` must be a namespaced string literal. The schema input must be JSON-compatible and cannot be `any`. Its output is the private representation, called Parts in the implementation. Views, equality, and debug callbacks receive this exact output type.

Use a Zod codec as the schema when input and Parts differ. The library wraps it in another codec: its forward operation seals the schema output, and its backward operation privately reads Parts. A custom output schema verifies the actual ES private-field brand before the backward operation runs. No internal read function is exported.

There are no library `parse`, `parseOrThrow`, `parseSafe`, `decode`, `encode`, or `canonical` methods, and no definition-level conversion callbacks. Consumers use `Kind.codec.parse` or `safeParse` for unknown input, `z.decode` or `z.safeDecode` for typed input, and `z.encode` for output. Nested contracts use the same Zod operations. Conversion failures use Zod errors.

An optional `allocate` callback produces schema input. `Kind.allocate(...args)` parses it through the codec and returns the sealed value. Invalid allocation throws a Zod error. Argument types are preserved. For asynchronous schemas, use Zod's asynchronous boundary APIs; allocation and executable docs are synchronous.

## Minted kinds

```ts
const Plan = defineMinted({
  kind: 'app/plan',
  mint: (input: Input) => ({ ok: true, value: prepare(input) }),
}).view({ rows: parts => copyRows(parts.rows) }).seal();
```

Required properties are `kind` and `mint`; `debug` is optional. `mint` returns `ProducerResult<Parts>`: `{ ok: true, value }` or `{ ok: false, error }`. Failure is returned unchanged. Each success creates a new instance. Minted kinds have no codec or allocator, and their equality is identity.

A minted value establishes that its configured producer succeeded. It does not establish that the producer is correct, or certify existence, authorization, currentness, or persistence.

## Construction and observation

Builders are immutable. Optional `.view(...)` supplies the complete projection map; a later call replaces it. Optional `.docs(...)` follows view configuration. `.seal()` completes a definition, validates documentation, registers its name, and freezes the kind. Repeating `.seal()` on the same builder returns the same kind. A failed completion does not reserve the name. Recursive completion fails.

The per-definition class has private Parts and a private lazy view cache. A private construction token prevents callers from creating genuine instances through a recovered constructor. Forged prototypes, proxies, casts, and structured clones do not obtain the brand.

Instances and per-definition prototypes are frozen. Parts are not generically copied, traversed, or frozen. If projections exist, a non-enumerable prototype getter validates the actual brand and returns a stable, frozen, null-prototype facade. Its only properties are the declared read-only projection getters. Each access runs the configured projection; mutable results must be detached copies. No projections means no instance view member.

All instances provide `equals` and `debug`. Implicit JSON, string, and numeric coercion throw. Semantic errors direct callers to Zod encoding. Minted errors explain that no external representation exists. Spreading an instance yields an empty object.

## Equality and collections

Semantic equality defaults to equality of deterministic keys computed from Zod-encoded JSON. Custom equality must agree with those keys. Object keys are sorted; array order, string escaping, and negative zero are preserved. Unsupported JSON values fail keying rather than being silently coerced.

`Kind.map()` and `Kind.set()` reject invalid runtime brands. Semantic collections key by codec-encoded JSON; minted collections key by instance identity. Replacing a semantic map entry preserves its original key object. Returned entry containers do not expose internal storage.

## Identity scope

A realm-wide registry under `Symbol.for('sealed-semantics/kinds')` rejects duplicate completed names, including separate installed package copies. It stores names, not Parts or definitions. It does not scan unloaded modules or coordinate separate realms.

TypeScript identity uses the literal kind string. It is not a fresh nominal identity minted by each factory call. `any` and assertions can bypass static restrictions; runtime brand checks remain authoritative.

## Documentation and laws

Semantic docs require a non-empty `examples` array with typed `input` and `encoded` on every entry. Sealing validates inputs, compares actual codec output, reparses it, and checks equality and stable encoding. There are no canonical examples. Minted docs have no wire examples. If views exist, docs require exactly those view names, each with a non-empty description and optional typed example.

`sealed-semantics/laws` is a Node-only optional test entry requiring fast-check. It checks codec round trips, equality, collections, frozen surfaces, brands, coercion, and projection alias safety. Function and accessor projections require explicit mutators; sealed children require explicit kind predicates. Tests sample behavior and cannot prove producer correctness or exclusive ownership. See [laws](laws.md) and [guarantees](guarantees.md).

Default semantic equality, semantic collections, executable docs, allocation, and the law harness require synchronous bidirectional schema operations. Zod async parsing can still create branded values from async refinements, but it does not make those synchronous operations async.
