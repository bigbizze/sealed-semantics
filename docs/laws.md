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

For configured copy observations, laws check the stable bound facade, equal bytes across calls, independent arrays and backing buffers, and isolation after mutating every byte of one result. Semantic laws also read a fresh copy through a second decode of the same input and through configured normalized aliases, after confirming reference identity. No consumer-supplied copy checks or mutators are needed. Focused runtime tests also verify compute-once behavior and isolation from retained producer arrays. These checks do not prove semantic equivalence or producer purity.

## Testing key collisions

A law is an invariant checked over generated inputs, not an exhaustive proof. `assertValueLaws` checks each generated value and any explicitly supplied equivalent aliases. It does not compare every pair of distinct generated values or discover duplicate definition names across modules.

To look for key collisions near the definition, generate pairs of valid inputs and keep the first sealed result alive while decoding the second. The production collision guard rejects different canonical Parts with the same key. For example:

```ts
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { z } from 'zod';
import { defineSeal } from 'sealed-semantics';

const Coordinate = defineSeal({
  name: 'test/coordinate',
  schema: z.object({ lat: z.number(), lng: z.number() }),
  key: p => `${p.lat}:${p.lng}`,
}).seal();
const coordinates = fc.record({
  lat: fc.integer({ min: -90, max: 90 }),
  lng: fc.integer({ min: -180, max: 180 }),
});
fc.assert(fc.property(coordinates, coordinates, (left, right) => {
  const a = Coordinate.codec.parse(left);
  const b = Coordinate.codec.parse(right);
  assert(Coordinate.is(a) && Coordinate.is(b));
}), { numRuns: 1_000 });
```

In an application test, import the real definition instead of redefining it. This recipe fails when a sampled pair triggers the guard; fast-check reports and shrinks the failing inputs. Keep explicit regression pairs for known collisions. Random sampling can miss rare cases and does not prove mathematical injectivity. Normalized aliases that produce the same canonical Parts are valid, not collisions.
