# Testing definitions

Install fast-check as a development dependency and import the optional Node-only harness from `sealed-semantics/laws`.

```ts
assertValueLaws(UserId, {
  validWire: fc.constant('usr_0123456789abcdef'),
});
assertMintedLaws(Plan, {
  validInput: planInputs,
  sealedKinds: [UserId, ProjectId],
});
```

`validWire` must generate input accepted by the codec. The harness parses it through Zod and verifies encoding/decoding round trips, equality laws, agreement between equality and encoded keys, and semantic map/set lookup with independently parsed equivalent values. Optional `equivalentAliases` supplies pairs expected to normalize to the same encoding. Optional `allocateArgs` checks configured allocator arguments and the resulting codec round trip.

Minted laws call the producer twice, verify both brands, and check identity equality and collection behavior. Minted values have no codec. A producer failure means the valid-input generator supplied an invalid case.

Common checks verify frozen kinds, instances, and prototypes; rejection of prototype forgery and recovered constructors; empty object spread; loss of brand on structured clone; and throwing implicit coercion. The harness mutates detached projection results, then reads the projections again to detect changes to private state. It also checks encoded JSON output for semantic kinds.

Configure mutators under `projectionMutators.view`, using exact declared projection names. Their arguments have the projection's return type. Plain objects, arrays, and buffers have built-in mutation attempts. Frozen outer containers still have their children visited. Function-valued projections and objects containing accessors require explicit mutators. Without a mutator, getters are not invoked by the harness.

For sealed children, supply `sealedKinds: [ChildKind]`. These explicit private-brand predicates prevent heuristic guesses based on object shape. Other custom mutable types need an explicit mutator. Observation captures standard buffers, Date, Map, Set, and own properties, but cannot inspect arbitrary private fields or closure state. Add domain-specific tests for those cases.

Passing laws establishes evidence for sampled cases. It does not prove producer correctness, exclusive ownership, absence of retained aliases, or coverage of every alias. A mutator that makes no observable change or an overly broad brand predicate can hide problems.

Documentation examples validate through the codec when the kind is sealed; no separate docs harness is required. See [executable documentation](documentation.md) and [producer obligations](guarantees.md).
