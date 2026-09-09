> Historical revision 5 baseline, retained as design history rather than a current usage guide. Names, APIs, CLI commands, and source-size rules below may have been removed. Use the [README](../README.md), [guarantees](guarantees.md), and [documentation guide](documentation.md) for the current API. [Amendments](amendments.md) record the changes and take precedence.

# sealed-value — implementation specification (revision 5)

Status: accepted design. Implementation begins with the mandatory type-inference spike in §8.3.
Package name is provisional; `sealed-value` is used throughout.

Changes from revision 4: runtime validity is tested by possession of the actual ES private
field rather than `instanceof`; private-field accessors are exported from the class body
through a static initialization block; producer callbacks are explicitly non-mutating; the
Parts guarantee now distinguishes safe direct returns (primitives and sealed values) from
mutable aliases; collection keying no longer uses a module-global indexer registry or
requires a single installed package copy; `Kind.parse` has a separate Result-preserving
path from the zod codec; `ValueError` no longer includes illegal construction; JSON number
semantics are explicit; projection-mutation testing has an explicit mutator contract; and
the type-inference surface is gated by a compile-only spike before runtime implementation.

Changes from revision 3: table headers repaired; runtime class is per definition while
the TypeScript brand is per kind; codec access to `#parts` is closed over from inside the
class body; the JSON round-trip law wording made precise.

Changes from revision 2: `kind` remains the compile-time and definition identity but is
not part of generic collection keys; renaming a kind is therefore a breaking type
change but not automatically a data change. Parts ownership remains a producer
obligation, with the guarantee narrowed to distinguish projection leaks (testable by
the law harness) from producer-retained aliases (a trusted producer obligation). All
examples and guidance are domain-neutral and assume no particular application,
source layout, or protocol.

## 1. Purpose

One mechanism for defining values whose meaning is established once, by one
producer, and whose representation leaves the value only through named operations.
Two constructors:

- `defineValue` — a **shared semantic value** (identifier, digest, address). Meaning: "this is a valid X under X's accepted grammar." Nothing more.
- `defineDerived` — a **local derived proof**. Meaning: "derive ran on these inputs, the producer transferred exclusive ownership of the result to the sealed value, and the sealed-value API has not exposed mutable access to it." Nothing more.

Everything else in the package exists to serve those two.

### 1.1 What a sealed value does not certify

Existence, membership, permission, currentness, storage success, transaction state.
These are contextual facts established by a scoped read, a database constraint, an
authorization check, or a transaction. Type names and docs must not suggest
otherwise.

### 1.2 Non-goals

- No registry of kinds, no plugins, no hooks, no custom-validator slot.
- No interning. Two parses produce two objects.
- No deep-freeze, no structural cloning, no generic object traversal.
- No test backdoor. Tests obtain values through the real producers.
- No Result library. The kit ships one discriminated union and nothing else.
- No configuration beyond the spec objects in §4. A case the kit does not cover belongs in the owning module.

## 2. Terminology

| Term | Meaning |
| --- | --- |
| `RawWire`     | `z.input<S>` of the `wire` schema. JSON-compatible external form. What crosses HTTP, rows, files, messages.   |
| `DecodedWire` | `z.output<S>` of the `wire` schema. May contain nested sealed values already decoded by nested `wire` codecs. |
| `Parts`       | Normalized internal state held in `#parts`. Owned exclusively by the sealed value. Never exposed whole.       |
| `Value`       | An instance of the sealed class.                                                                              |
| `kind`        | Globally unique string literal naming the concept. Part of type identity; not automatically part of wire, canonical data, or collection keys. |
| `seal`        | The single private construction operation.                                                                    |
| projection    | A named operation producing a representation from a value: `encode`, `canonical`, field accessors, `debug`.   |

The public `value.encode()` returns `RawWire`. The spec-level producer operation
`toWireShape` returns `DecodedWire`; the kit runs zod's backward encoding to reach
`RawWire`.

## 3. Package layout and constraints

```
sealed-value/
  src/
    index.ts        defineValue, defineDerived, IdMap, IdSet, ValueOf, Result, ValueError, ok, err
    seal.ts         construction token, per-definition sealed class factory, coercion traps
    codec.ts        zod codec construction, producer-error → zod issue mapping
    keying.ts       stableWireKey (deterministic JSON)
    collections.ts  IdMap, IdSet
    laws.ts         assertValueLaws / assertDerivedLaws harness (test-only export)
  bin/
    check-kinds.mjs syntactic duplicate-kind scan for CI (§8.2)
  docs/
    guarantees.md
    laws.md
    methods-on-canonical-instances-vs-static-method-import.md

```

Peer dependency: `zod >=4.1` (codecs, `z.input`/`z.output`, `safeDecode`). No other
runtime dependencies. `fast-check` or equivalent as a dev dependency.

Runtime source under 400 lines. If exceeded, record why in `guarantees.md` or
remove the feature.

## 4. Public API

```ts
export function defineValue<const S extends ValueSpecBase>(spec: S): ValueKindFrom<S>;
export function defineDerived<const S extends DerivedSpecBase>(spec: S): DerivedKindFrom<S>;

export class IdMap<Kd extends AnyKind, V> { constructor(kind: Kd); /* Map-like, see §9 */ }
export class IdSet<Kd extends AnyKind>     { constructor(kind: Kd); /* Set-like */ }

export type ValueOf<Kd extends AnyKind> = /* instance type produced by Kd */;

export type Result<T, E = ValueError> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly error: E };
export const ok:  <T>(value: T) => Result<T, never>;
export const err: <E>(error: E) => Result<never, E>;

export interface ValueError {
  readonly kind: string;
  readonly reason: "invalid_wire" | "invalid_parts" | "invalid_input";
  readonly issues: readonly string[];
}

```

Generic parameters are inferred from the spec object (`const S`), so `allocate`'s
exact parameter list and the exact `fields` mapping survive into the kind type.
Manually threaded generics are not used.

### 4.1 `ValueSpecBase`

```ts
interface ValueSpecBase {
  kind: string;                                  // globally unique, namespaced (§8.2)
  wire: z.ZodType;                               // RawWire = z.input, DecodedWire = z.output
  decode: (w: DecodedWire) => Result<Parts, ValueError>;   // alias normalization here
  toWireShape: (p: Parts) => DecodedWire;        // nested sealed values still present
  equals?: (a: Parts, b: Parts) => boolean;      // default: stableWireKey equality (§9)
  allocate?: (...args: any[]) => RawWire;        // → wire.safeParse → decode → seal
  canonical?: (p: Parts) => unknown;             // caller-typed protocol representation
  fields?: Record<string, (p: Parts) => unknown>;   // explicit projections
  debug?: (p: Parts) => string;                  // default: kind only
}

```

Type constraint: `z.input<S["wire"]>` must extend `JsonValue`
(`string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }`).
RawWire is the boundary domain and must be deterministically keyable (§9). The type
constraint cannot exclude `NaN` or infinities, so the runtime keyer and law harness also
validate the JSON number rules in §9.1.

### 4.2 `DerivedSpecBase`

```ts
interface DerivedSpecBase {
  kind: string;
  derive: (input: Input) => Result<Parts, ValueError>;   // the only producer
  fields?: Record<string, (p: Parts) => unknown>;
  debug?: (p: Parts) => string;
}

```

No `wire`, `allocate`, `canonical`, or `equals`. A derived value has no external
form and no semantic equality (§9.2). If either is needed, the concept is a semantic
value and should be defined with `defineValue`.

## 5. Instance surface

| Member | Semantic | Derived |
| --- | --- | --- |
| `encode(): RawWire`                 | yes    | no             |
| `equals(other: same kind): boolean` | yes    | yes (identity) |
| `debug(): string`                   | yes    | yes            |
| `toJSON()`                          | throws | throws         |
| `valueOf()`                         | throws | throws         |
| `[Symbol.toPrimitive]()`            | throws | throws         |

Nothing else. The thrown error is a `TypeError`:

```
"<kind> cannot be serialized implicitly; use value.encode() or encode the enclosing contract schema"

```

`encode()` is implemented as `z.encode(spec.wire, spec.toWireShape(#parts))`, so
nested sealed values inside a composite are encoded backward by their own codecs and
the result is fully raw. This is the complete external representation; no other instance
operation yields a reversible external form.

Invariant: instances expose no representation except through explicitly named
projections; implicit coercion and generic serialization never yield a valid one.
Rationale for methods-on-instances is recorded in §13.1 and not re-argued here.

## 6. Kind surface

```ts
// semantic
Kind.kind:      K
Kind.parse:     (input: unknown) => Result<Value, ValueError>   // wire.safeParse → decode → seal
Kind.is:        (x: unknown) => x is Value
Kind.allocate?: (...exactArgs) => Result<Value, ValueError>     // spec.allocate → wire.safeParse → decode → seal
Kind.wire:      z.ZodCodec<S, ValueSchema>                      // decode/encode/safeDecode/safeEncode per zod
Kind.canonical?:(v: Value) => C
Kind.<field>:   (v: Value) => ProjectionType                    // one per spec.fields entry

// derived
Kind.kind:      K
Kind.derive:    (input: Input) => Result<Value, ValueError>
Kind.is:        (x: unknown) => x is Value
Kind.<field>:   (v: Value) => ProjectionType

```

No `indexKey`, `parts`, `raw`, `unwrap`, `fromParts` on any kind.

`wire` is a zod schema and exposes zod's API. The kit's claim is "no
value-specific operations beyond those declared," not "no other methods exist."

## 7. Runtime guarantees

### 7.1 Construction and runtime branding

Construction requires a module-private token. Runtime validity is established by the
actual ES private field, not by the prototype chain. `instanceof` is deliberately not a
security or validity check: `Object.create(Object.getPrototypeOf(realValue))` can satisfy
`instanceof` without ever running the constructor.

The per-definition class therefore exports two closures from *inside the class private-name
scope* by assigning them in a static initialization block:

```ts
const CONSTRUCT: unique symbol = Symbol("sealed-value/construct");

let hasBrand!: (x: unknown) => x is Sealed;
let unseal!: (x: Sealed) => Parts;

class Sealed {
  #parts: Parts;

  constructor(token: typeof CONSTRUCT, parts: Parts) {
    if (token !== CONSTRUCT) throw illegalConstruction(kind);
    this.#parts = parts;
  }

  static {
    hasBrand = (x: unknown): x is Sealed =>
      typeof x === "object" && x !== null && #parts in x;

    unseal = (x: Sealed): Parts => {
      if (!hasBrand(x)) throw new TypeError(`${kind} is not a sealed value`);
      return x.#parts;
    };
  }
}
```

A closure merely located in the surrounding factory cannot name `#parts`; the private-field
access expression must be written inside the class's private-name scope. The static block is
the required bridge. `hasBrand` and `unseal` are closure-local and are never properties of
the returned kind or class.

The class expression is evaluated inside each `defineValue` / `defineDerived` call, so each
definition has its own runtime private-field brand. `Kind.is` uses `hasBrand`. It therefore
rejects an instance of another definition and also rejects a prototype-forged object that
never ran the constructor. The TypeScript identity remains per kind (§8.1); runtime identity
is per definition.

`Object.getPrototypeOf(v).constructor` remains reachable from a real instance, but the
construction token makes the recovered constructor unusable. Tests cover both constructor
recovery and prototype forgery.

### 7.2 One seal funnel

```
parse:        unknown → spec.wire.safeParse → spec.decode → seal
wire.decode:  RawWire → (zod) → spec.decode → seal
allocate:     args → spec.allocate → parse path above
derive:       input → spec.derive → seal

```

`allocate` output is treated exactly like external RawWire. No public operation constructs;
every successful acquisition passes through the same private `seal`. Tests assert the sealed
class, construction token, `hasBrand`, and `unseal` closures are unreachable from exports.

### 7.3 Parts ownership and immutability (producer obligations)

The kit guarantees:

- the whole stored `Parts` value is never exposed;
- no mutable object reachable from `Parts` is returned to consumers by the kit itself;
- primitives and already-sealed values may be returned directly because they do not expose
  mutable access to the enclosing `Parts`;
- all consumer-visible mutable structures must be fresh structures produced by the owning
  spec callback or by zod encoding.

The producer guarantees, as part of the trusted computing base:

- `decode` and `derive` return a `Parts` graph for which the producer retains no mutable alias;
- every callback that receives `Parts` treats it as immutable and must not mutate it or
  anything reachable from it. This applies to `toWireShape`, custom `equals`, `canonical`,
  every field projection, and `debug`;
- `fields` and `canonical` return primitives, sealed values, or fresh copies of anything
  mutable (`bytes.slice()`, `[...list]`, a domain-specific copy function, etc.);
- any custom value returned by a projection that is mutable must likewise be a fresh value
  with no mutable alias back into `Parts`.

The kit does not copy typed arrays, traverse object graphs, or freeze anything.
`Object.freeze` is not relied on. `guarantees.md` states these producer obligations
verbatim. The law harness (§11) can detect mutable aliases exposed through projections by
mutating a projection result and checking that a subsequent projection is unchanged. It
cannot in general detect a mutable alias retained privately by `decode` or `derive`, nor can
it prove that a callback never mutates `Parts`; those remain trusted producer obligations.

### 7.4 Duplicate kinds

A module-level `Set<string>` of kinds seen by that installed copy of the package makes
`defineValue` / `defineDerived` throw on a repeated literal. This is a fast development-time
check, not a registry and not the primary uniqueness guarantee. The static check in §8.2 is
what detects duplicates across source roots and across multiple installed copies.

## 8. Type-level guarantees

### 8.1 Per-kind nominality

The runtime class is freshly created per definition (§7.1), but a generic factory call cannot
mint a fresh compile-time nominal identity that TypeScript can carry as part of the public
API. The public instance type therefore carries an erased brand keyed by the literal `kind`:

```ts
declare const BRAND: unique symbol;
type Branded<K extends string> = { readonly [BRAND]: K };
type Value<S> = SealedPublicShape<S> & Branded<S["kind"]>;

```

No runtime property exists. `equals(other)` is typed against the same `K`; cross-kind
comparison and assignment are compile errors.

This is **per-kind** TypeScript nominality, not per-definition nominality. Two definitions
with the same `kind` literal have the same public TypeScript type even though each has a
different runtime private-field brand. Duplicate kinds are therefore prohibited (§8.2). A
caller-supplied fresh type token could make compile-time identity per definition and is
judged not worth the API cost.

Consequence: renaming a `kind` is a breaking type change. The kit does not put
`kind` into RawWire, canonical output, or semantic collection keys automatically, so
a rename is not by itself a data change. A consumer may deliberately include `kind`
in a protocol, hash preimage, persisted key, or other external representation; if it
does, renaming that kind is also a migration for that consumer. `guarantees.md` says
so.

### 8.2 Globally unique kinds

- Kinds are namespaced with a stable logical namespace, for example `"example/user-id"` and `"example/content-address"`. The namespace is an identity namespace. It should be chosen for stability rather than copied from a temporary package name, source path, or deployment name.
- Runtime: §7.4.
- Static check: `bin/check-kinds.mjs <globs>` scans the source roots supplied to it for `defineValue({ kind: "…" })` / `defineDerived({ kind: "…" })` and fails on duplicate literals, including duplicates that use different installed copies of the package. It is suitable for CI but does not depend on any particular project layout. No compiler API required.

### 8.3 Inference gate

The intended public surface is:

```ts
export function defineValue<const S extends ValueSpecBase>(spec: S): ValueKindFrom<S>;
export function defineDerived<const S extends DerivedSpecBase>(spec: S): DerivedKindFrom<S>;
```

`ValueKindFrom<S>` must preserve:

- the exact parameter list of `allocate`;
- one method per literal key of `fields`;
- the exact declared return type of each field projection;
- the canonical return type when `canonical` is present;
- `ValueOf<typeof Kind>` as a value branded by the literal `kind`;
- the distinction between `RawWire = z.input<S["wire"]>` and
  `DecodedWire = z.output<S["wire"]>`.

A `const S` signature preserves an already-inferred object type but does not by itself prove
that sibling callbacks inside the spec object receive the desired contextual types. In
particular, `wire` must determine `DecodedWire`, `decode` must determine `Parts`, and then
`toWireShape`, `equals`, `canonical`, and `fields` must all see that `Parts` type. This is a
TypeScript inference constraint, not a runtime design assumption.

**Mandatory first implementation step:** before runtime implementation, compile a minimal
type-only spike containing the four reference shapes in §14 and assert all of the following
without callback parameter annotations:

```ts
// decode parameter is inferred as DecodedWire
// toWireShape / equals / canonical / fields parameters are inferred as Parts
// allocate parameters survive exactly
// field methods have their exact declared return types
// composite nested codecs infer sealed nested values on the decoded side
// ValueOf and cross-kind assignment tests behave as §8.1 requires
```

If that spike fails, the factory's type plumbing or builder shape must change before any
runtime code is written. The runtime model in §§7–10 does not change merely to preserve the
one-object-literal syntax.

Projection return types are **preserved, not automatically made readonly**. Producers that
want a readonly consumer type declare one explicitly, for example
`(p) => [...p.items] as readonly Item[]`. Runtime alias safety comes from returning a fresh
value (§7.3), not from a mapped `readonly` transformation.

## 9. Keying, equality, collections

### 9.1 Semantic values

`stableWireKey(raw: JsonValue): string` is a deterministic JSON encoder:

- object keys are sorted lexicographically;
- array order is preserved;
- strings use JSON escaping;
- booleans and `null` use their JSON spellings;
- numbers must be finite; non-finite numbers are rejected as a programming/spec error;
- negative zero is encoded as `-0`, so `Object.is(JSON.parse(stableWireKey(-0)), -0)` is true;
- no insignificant whitespace is emitted.

The compile-time `JsonValue` constraint cannot exclude `NaN` or infinities, so
`stableWireKey` validates the number rule recursively. Law 13 requires every value's
`encode()` output to satisfy this runtime domain.

Default semantic equality is:

```ts
stableWireKey(a.encode()) === stableWireKey(b.encode())
```

If a producer supplies custom `equals`, the law harness checks that it agrees exactly with
this key (§11 law 5). Alias normalization therefore affects equality and collection lookup in
one place: independently parsed aliases must encode to the same RawWire.

### 9.2 Derived values

`equals` is fixed to instance identity. Two independently derived proofs with identical
contents are two proofs. Needing semantic equality on a derived value is evidence that the
concept should instead be a semantic value.

### 9.3 `IdMap` / `IdSet`

Collections are constructed with a kind and do not use a module-global indexer registry.
This removes any requirement that the package appear only once in the dependency graph.

For a semantic kind, the collection uses `stableWireKey(value.encode())` as its internal map
key. For a derived kind, the sealed object itself is the native `Map` / `Set` key because
derived equality is instance identity. The constructor can distinguish the two public kind
shapes by the presence of the semantic `wire`/`parse` surface.

A semantic collection may keep a collection-local `WeakMap<object, string>` cache of already
computed wire keys as a performance optimization. Such a cache is not part of identity, is
not shared between collections, and does not change any law.

`IdMap` / `IdSet` reject a key for which the supplied kind's `is` predicate is false. They
expose ordinary `Map` / `Set` behavior except for operations that would expose the internal
semantic string key. Iteration yields the original sealed values. No `indexKey` is public.

## 10. Codecs

### 10.1 Wire

The output schema validates the actual private-field brand, not the prototype chain:

```ts
const ValueSchema = z.custom<Value>(
  (x) => hasBrand(x),
  `${kind} sealed value expected`,
);

Kind.wire = z.codec(spec.wire, ValueSchema, {
  decode: (decodedWire, ctx) => {
    const r = spec.decode(decodedWire);
    if (!r.ok) {
      ctx.issues.push({
        code: "custom",
        message: r.error.issues.join("; "),
        input: decodedWire,
      });
      return z.NEVER;
    }
    return seal(r.value);
  },
  encode: (value) => spec.toWireShape(unseal(value)),
});
```

`hasBrand` and `unseal` are the static-block closures from §7.1. A prototype-forged object
therefore fails the output schema before the encode transform runs. Zod codecs encode nested
codecs backward, so an enclosing object schema produces fully raw external data.

Error semantics follow zod: `Kind.wire.decode` / `encode` throw `ZodError`;
`safeDecode` / `safeEncode` return zod's safe result. Producer rejections become zod custom
issues on this codec path.

`Kind.parse` is intentionally a separate path so the kit does not lose the producer's
`ValueError` by converting it to and then reconstructing it from a zod issue:

```ts
function parse(input: unknown): Result<Value, ValueError> {
  const w = spec.wire.safeParse(input);
  if (!w.success) return err(invalidWire(kind, w.error));

  const p = spec.decode(w.data);
  if (!p.ok) return p;

  return ok(seal(p.value));
}
```

`allocate(...args)` calls this same parse path on `spec.allocate(...args)`.

Composition:

```ts
const Response = z.object({ user_id: UserId.wire, address: ContentAddress.wire });
z.encode(Response, { user_id: userId, address });   // fully raw JSON shape
z.decode(Response, body);                           // sealed values
```

### 10.2 Canonical

Optional, caller-typed. The callback receives real `Parts` (§7.3) and must return a
structure that does not alias mutable internal state. Changing a `canonical`
function changes every hash or protocol value that depends on that output. Consumers
that rely on stable canonical output should pin it with golden vectors or equivalent
compatibility tests. The kit cannot do this for them and says so.

### 10.3 Aliases

If a grammar accepts more than one spelling for one identity, `decode` maps all to
one `Parts` and `toWireShape` yields one form, so `encode(decode(alias))` is the
canonical form and `equals` and collection keys agree. Canonical hashes agree when
they are derived from a declared `canonical` projection satisfying law 6. If spellings
are different identities, they are different kinds. The spec author must choose; the law harness
requires an `equivalentAliases` generator whenever the grammar admits more than one
form, and law 4 fails if the choice is not made.

## 11. Laws

Property-tested through a test-only harness with explicit generators. Arbitraries are not
derivable from arbitrary zod schemas. Projection mutation also needs an explicit contract:
the harness has built-in mutators for plain arrays, plain objects, and `ArrayBufferView`s; a
producer whose projection returns another mutable type supplies a test-only mutator for that
projection. Every mutable `encode`, `canonical`, or field projection must be covered by a
built-in or supplied mutator.

```ts
assertValueLaws(UserId, {
  validWire: fc.Arbitrary<RawWire>,
  equivalentAliases?: fc.Arbitrary<[RawWire, RawWire]>,
  allocateArgs?: fc.Arbitrary<Parameters<typeof UserId.allocate>>,
  projectionMutators?: {
    encode?: (value: RawWire) => void,
    canonical?: (value: Canonical) => void,
    fields?: Record<string, (value: unknown) => void>,
  },
});

assertDerivedLaws(PreparedWrite, {
  validInput: fc.Arbitrary<Input>,
  projectionMutators?: { fields?: Record<string, (value: unknown) => void> },
});
```

Semantic kinds:

1. `K.is(K.parse(w).value)` for valid `w`.
2. A prototype-forged object made with `Object.create(Object.getPrototypeOf(v))` does not satisfy `K.is`.
3. `K.parse(v.encode()).value.equals(v)`.
4. For `[a, b]` from `equivalentAliases`: `K.parse(a).value.equals(K.parse(b).value)` and their `encode()` results deep-equal.
5. `a.equals(b)` iff `stableWireKey(a.encode()) === stableWireKey(b.encode())` (including custom `equals`).
6. `a.equals(b)` implies `K.canonical(a)` deep-equals `K.canonical(b)` when declared.
7. `equals` is reflexive, symmetric, and transitive.
8. Mutating every mutable consumer-visible projection (`encode`, `canonical`, and fields) leaves a subsequent projection of the same state unchanged. This detects projection leaks; it does not prove that producer code retained no private alias or never mutates `Parts` internally (§7.3).
9. `Object.getPrototypeOf(v).constructor` cannot construct without the private token.
10. `JSON.stringify(v)`, `` `${v}` ``, `String(v)`, and `+v` throw with the §5 message.
11. `{ ...v }` is `{}` and `Object.keys(v)` is `[]`.
12. `structuredClone(v)` does not satisfy `K.is`.
13. `v.encode()` contains only the runtime JSON domain from §9.1 (in particular, no non-finite numbers), and `JSON.parse(stableWireKey(v.encode()))` deep-equals `v.encode()` including preservation of negative zero.

Derived kinds:

14. `K.is(K.derive(i).value)` for valid `i`.
15. Prototype forgery does not satisfy `K.is`.
16. `a.equals(b)` iff `a` and `b` are the same instance; `IdMap` / `IdSet` agree.
17. Laws 8–12 hold where applicable (`encode` and `canonical` do not exist on derived values).

`laws.md` states each law in prose with its rationale and the exact scope of what the law
harness can and cannot establish.

## 12. Errors

- `Kind.parse`, `Kind.allocate`, and `Kind.derive` return `Result<Value, ValueError>` and do not throw for invalid external/producer input.
- `Kind.parse` converts `spec.wire.safeParse` failures directly to `reason: "invalid_wire"` and preserves a producer `ValueError` returned by `spec.decode`.
- `Kind.wire.*` follows zod: throwing `decode` / `encode`, safe `safeDecode` / `safeEncode`; producer rejection on this path is represented as a zod custom issue.
- Producer callbacks (`decode`, `derive`) return `Result<Parts, ValueError>`; the kit never tries to distinguish `Parts` from an error structurally.
- Coercion traps, recovered-constructor calls without the token, invalid calls to private runtime bridges, and violations detected by `stableWireKey` are programming/specification errors and throw `TypeError` (or an equivalent documented programming-error type). They are not `ValueError`s.

## 13. Documentation deliverables

### 13.1 `docs/methods-on-canonical-instances-vs-static-method-import.md`

Records why `encode()`, `equals()`, `debug()` live on instances:

- **Alternative.** A free `encode(v)` from a separately importable `codecs` entry can be import-scoped, giving an enforceable region that may hold and compare values but not render them. A method travels with the value and cannot be scoped.
- **Why methods.** A value that can be hashed must be renderable wherever hashing happens, and hashing is domain work. A render-free region is rare in practice; once `codecs` is importable from the middle of an application the scoping is a naming convention, and `Kind.wire.encode(v)` at every call site buys nothing enforceable.
- **What is preserved.** Every rendering is a named, deliberate call; implicit coercion and generic serialization never yield a valid representation. Per-kind grep of crossings is lost; a type-aware lint on `.encode()` receivers recovers it when tooling permits.
- **After the RawWire split**, `encode()` unambiguously means "complete external representation," which strengthens the case for it being the instance's one rendering method.
- **When to revisit.** A codebase that can draw a render-free region could use a second, free-function entry. Do not add it speculatively.

### 13.2 `docs/guarantees.md`

For each constructor: what the type certifies; what it does not (§1.1); which
guarantees are runtime (construction token, private-field brand, private state) versus
compile-time only (per-kind brand); the producer obligations the kit cannot enforce
(exclusive Parts ownership, non-mutating callbacks, projection copies, canonical output
aliasing, compatibility vectors); that prototype identity alone is not validity; that
`kind` is part of type identity but not automatically data identity; that consumers make
`kind` data-bearing only by explicitly including it in an external representation; and
that RawWire must satisfy the exact JSON runtime domain in §9.1. No single-copy package
requirement is imposed.

### 13.3 `docs/laws.md` — §11 in prose.

### 13.4 README — under 150 lines, examples from §14 only.

## 14. Reference examples (normative for the README)

```ts
// Identifier with a legacy alias
export const UserId = defineValue({
  kind: "example/user-id",   // illustrative namespace; consumers choose their own stable namespace
  wire: z.string().regex(/^(usr_[a-f0-9]{16,}|user:[0-9a-f-]{36})$/),
  decode: (w) => ok({ spelling: normalizeUserSpelling(w) }),
  toWireShape: (p) => p.spelling,
  allocate: (gen: () => string) => `user:${gen()}`,
  canonical: (p) => ({ type: "utf8", value: p.spelling }),
  debug: (p) => `user(…${p.spelling.slice(-6)})`,
});
export type UserId = ValueOf<typeof UserId>;

// Bytes-backed digest — producer owns freshness
export const Sha256Digest = defineValue({
  kind: "example/sha256",
  wire: z.string().regex(/^[a-f0-9]{64}$/),
  decode: (hex) => ok({ bytes: hexToBytes(hex) }),         // fresh buffer
  toWireShape: (p) => bytesToHex(p.bytes),
  equals: (a, b) => constantTimeEqual(a.bytes, b.bytes),   // must agree with law 5
  canonical: (p) => ({ type: "bytes", value: p.bytes.slice() }),   // copy on egress
});

// Composite with explicit projections; RawWire is the fully encoded object
export const ContentAddress = defineValue({
  kind: "example/content-address",
  wire: z.object({
    namespace_id: NamespaceId.wire,
    content_class: z.enum(["primary", "attachment"]),
    digest: Sha256Digest.wire,
  }),
  decode: (w) => ok(w),          // DecodedWire already holds sealed NamespaceId / Sha256Digest
  toWireShape: (p) => p,         // zod encodes the nested values backward
  fields: {
    namespace:    (p) => p.namespace_id,
    contentClass: (p) => p.content_class,
    digest:       (p) => p.digest,
  },
});
address.encode();
// { namespace_id: "ns:…", content_class: "primary", digest: "ab12…" }

// Derived proof, module-private, identity equality
const PreparedWrite = defineDerived({
  kind: "example/prepared-write",
  derive: (input: PrepareInput) => ok({
    rows: buildRows(input),                    // fresh structure
    contentToRetain: input.content.map(toContentAddress), // fresh array
  }),
  fields: {
    rows:            (p) => copyWriteRows(p.rows) as Readonly<WriteRows>,
    contentToRetain: (p) => [...p.contentToRetain] as readonly ContentAddress[],
  },
});
export const prepareWrite = PreparedWrite.derive;
export function commitWrite(plan: ValueOf<typeof PreparedWrite>, io: CommitIo) { /* … */ }

// Crossings
.where("user_id", "=", userId.encode())

const parsed = UserId.parse(row.user_id);
if (!parsed.ok) return storageError(parsed.error);
const userId = parsed.value;

return z.encode(ResponseSchema, { user_id: userId });   // ResponseSchema uses UserId.wire

```

## 15. Test plan

- First gate: the §8.3 compile-only inference spike. Runtime implementation does not begin until it passes or the public type-builder shape is revised.
- Property tests: §11 against every §14 example, with explicit generators, alias pairs where applicable, and mutators covering every mutable projection.
- Runtime unit tests: private-field `Kind.is`; prototype forgery rejected; output codec rejects prototype forgery; recovered-constructor throw; duplicate kind (runtime and `check-kinds`); alias normalization; producer-error → zod custom issue; `Kind.parse` preserves producer `ValueError`; `IdMap` with independently parsed equal semantic keys; `IdMap` with derived identity keys; collections work without a module-global indexer registry; composite `encode()` is fully raw; non-finite RawWire numbers rejected by keying/laws; negative zero preserved by `stableWireKey`; coercion traps; `structuredClone` failure.
- Producer-contract tests on examples: callbacks do not mutate `Parts`; projection mutation cannot affect later projections; bytes-backed canonical output is copied; `PreparedWrite` uses a domain copy function rather than assuming `structuredClone` is safe for graphs containing sealed values.
- Type tests: cross-kind `equals`/assignment rejected; same-kind definitions have the same public TypeScript brand but different runtime brands (documented); `allocate` parameter types preserved; field projection return types preserved exactly (not automatically readonly); RawWire non-JSON structural types rejected at the type level; no `indexKey`/`parts`/`raw` member on kinds or instances.

## 16. Acceptance criteria

1. The §8.3 inference spike passes for all §14 reference shapes without callback parameter annotations, or the public builder/type shape is revised and the spike then passes.
2. All §11 laws pass for all §14 examples.
3. Prototype-forged objects fail both `Kind.is` and the codec output schema; recovered constructors cannot construct.
4. Runtime source remains under 400 lines with one peer dependency, unless an explicit size exception is recorded in `guarantees.md`.
5. `guarantees.md`, `laws.md`, and §13.1 exist and match the implementation, including the limits of producer-obligation testing.
6. No export exposes the sealed class, construction token, `hasBrand`, `unseal`, any semantic key string, or any whole-`Parts` accessor.
7. `check-kinds` passes on the kit's examples and is documented for consumers.
8. Collections do not depend on a module-global kind/indexer registry and do not require a single installed copy of the package.
9. A consumer can define an identifier, a digest, a composite, and a derived value from the README alone.
