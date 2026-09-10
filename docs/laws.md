# Test your definitions

Install `fast-check` as a development dependency and import the Node-only law harness from `sealed-semantics/laws`.

```ts
assertValueLaws(UserId, {
  validWire: fc.constantFrom('USR_123ABC', 'usr_123abc'),
  equivalentAliases: fc.constant(['USR_123ABC', 'usr_123abc']),
});
assertMintedLaws(Plan, { validInput: acceptedPlanInputs });
```

Semantic laws check repeated-decode identity, codec round-trip identity, stable encoding, native Map/Set lookup, private brands, frozen surfaces, serialization traps, and stable deeply immutable views. `allocateArgs` is available only when the kind has an allocator.

Minted laws check distinct successful events and the same construction and observation invariants. Genuine local sealed leaves require no extra configuration. Forged and foreign-package leaves are rejected. Mint errors can have any producer-owned type; the generic harness checks success without inspecting domain error properties.

A sealed value belongs to exactly one completed definition instance. Same-label definitions are unrelated. Property generators must produce inputs accepted by the tested definition. Tests use reference equality, not enumeration of private objects.

The harness samples behavior. It does not prove that a key captures the intended domain semantics, that producers never mutate aliases, or that checks establish external facts. Production collision assertions protect against different supported Parts sharing a live key. Add domain-specific examples for normalization and intended identity.

For configured conversions, laws check the stable bound facade, equivalent contents across calls, independent object graphs, and isolation after mutating one result. These checks sample deterministic conversions and do not measure copying performance.
