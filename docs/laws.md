# Laws

Import `assertValueLaws` and `assertDerivedLaws` from `sealed-semantics/laws`. The test-only entry declares fast-check ^4.9.0 as an optional peer. Install it and Node type declarations as development dependencies. Supply explicit fast-check arbitraries; a Zod schema does not supply a generator. The harness runs synchronous properties, using fast-check's default run count and seed handling. Fast-check failure causes contain the underlying assertion.

1. Accepted semantic input produces a value recognized by its kind. This checks the acquisition path.
2. A prototype-forged object is rejected. A prototype is not the private-field brand.
3. Parsing an encoded semantic value produces an equal value. Encoding must remain in the accepted grammar.
4. Equivalent aliases parse to equal values and identical wire data. Supply `equivalentAliases` whenever the accepted grammar admits aliases. The harness cannot discover aliases or determine that this generator is needed.
5. Equality agrees exactly with deterministic wire key equality. This applies to custom equality too, so collection lookup and equality agree.
6. Equal values have deeply equal canonical projections when declared. Independent reparses and supplied alias pairs exercise equal inputs as well as random pairs.
7. Semantic equality is reflexive, symmetric, and transitive. Random triples test these implications; equal reparses exercise equality directly.
8. Mutating each mutable projection leaves all later projections unchanged. The harness checks instance encode(), canonical(), and every view field. It recursively mutates arrays, plain objects, and ArrayBufferViews, so a fresh outer container does not hide an alias to a mutable child. Children recognized by the tested kind or an explicitly supplied `sealedKinds` kind are treated as opaque identities. Recognition uses those kinds' actual private-brand predicates, never a method-name heuristic. Supply `projectionMutators` for other mutable types, including custom mutable types nested in projections. A custom mutator replaces the built-in mutator for that projection and must cover its entire mutable graph. A readonly type is not evidence that runtime data is immutable.
9. A recovered constructor cannot construct without the token.
10. JSON serialization, template interpolation, String conversion, unary plus, and valueOf throw the specified TypeError. Semantic errors recommend explicit encoding; derived errors state that the value has no external representation.
11. Object spread is empty and Object.keys returns no keys. Parts do not become enumerable data.
12. A structured clone fails the kind predicate. Cloning does not confer a private brand.
13. Encoded data satisfies the full runtime JSON domain, including finite numbers, and survives deterministic JSON parsing with negative zero preserved. Internal keying validates recursively.
14. Accepted derived input produces a value recognized by its kind.
15. A prototype-forged derived object is rejected.
16. Derived equality is identity. Independently produced values remain distinct keys in kind-scoped maps and sets; repeated use of the same instance agrees with identity.
17. Derived values satisfy laws 8–12. They have no encode or canonical operations.

An allocation-argument arbitrary also checks successful allocation, runtime branding, common instance laws, and a parse/encode round trip. Semantic collection checks use independently parsed equivalent keys. Unit tests separately check codec output forgery, invalid inputs, error preservation, iteration, and the duplicate-kind scanner.

The harness is test-only and traverses projections, never private Parts. Built-in mutators accept frozen plain objects and arrays, and still visit their children. Function-valued projections require an explicit projectionMutator. Accessor-containing outputs require an explicit projectionMutator, including accessors nested inside plain containers. Without one, the harness rejects the output without invoking its getters. With an explicit mutator, observation reads getters with their original receiver and snapshots the returned graph. Getter side effects and exceptions are then part of the test; setters and private closure state still need domain observations. Custom types with private state need a mutator that makes an observable change; the observer captures enumerable and non-enumerable own state plus standard Date, Map, Set, and buffer content, but cannot inspect arbitrary private class state. Test such projections through additional domain observations. A dishonest or ineffective mutator cannot establish alias safety.

Passing laws provides evidence for generated cases. It does not prove that producers retained no private aliases, that callbacks never mutate Parts, that all grammar aliases were generated, or that future protocol changes preserve compatibility. Review those producer obligations and maintain explicit compatibility vectors.

The amended facade tests verify a non-enumerable prototype getter, real-brand validation, stable per-instance identity, a frozen null-prototype facade, read-only projection getters, exact facade keys, and absence when view is empty or missing. The original spread and cloning laws apply before and after accessing view. Type tests also reject removed static projections and invalid collection keys. A compiler-output test checks that reserved-field errors contain the field name and a readable correction.

For projections containing sealed children of other kinds, pass `sealedKinds: [NamespaceId, Sha256Digest]` (or the relevant kinds) to the harness. This is a test-local list of explicit brand predicates, not a runtime registry. Unrecognized custom objects require a projectionMutator. An object with equals/debug/coercion methods is not assumed to be sealed and cannot silently bypass mutation checks. The supplied kinds and mutators are trusted test configuration; an overly broad predicate or ineffective mutator can still hide problems. Private state inside custom projection classes requires separate domain observations because the generic snapshot cannot inspect it.

Common laws now also require frozen kinds, instances, and prototypes. Dedicated tests attempt property addition, prototype replacement, method deletion, and method replacement, then confirm that lazy view caching and all projections still work.

Configure custom view mutators under `projectionMutators.view`. The harness reads each view getter again after mutation, so it checks fresh outputs against the earlier observations.
