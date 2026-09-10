# Digests and byte buffers

For digests, request hashes, and other byte-valued domain data represented as canonical strings, keep that string as Parts. Convert it to bytes when a crypto, filesystem, or binary API needs a buffer.

```ts
import { z } from 'zod';
import { defineSeal, type ValueOf } from 'sealed-semantics';

const Digest = defineSeal({
  name: 'kernel/digest',
  schema: z.string().regex(/^[0-9a-f]{64}$/),
  key: hex => hex,
})
  .view({ hex: hex => hex })
  .copy({
    bytes: hex => Uint8Array.from(
      hex.match(/../g)!,
      pair => Number.parseInt(pair, 16),
    ),
  })
  .seal();
type Digest = ValueOf<typeof Digest>;

const a = Digest.codec.parse('ab'.repeat(32));
const b = Digest.codec.parse('ab'.repeat(32));
console.log(a === b); // true: same live semantic value in this definition
console.log(new Map<Digest, string>([[a, 'stored']]).get(b)); // stored

const x = a.copy.bytes();
const y = a.copy.bytes();
console.log(x === y); // false: separate buffers with equal contents
x[0] = 0;
console.log(y[0]); // 171: changing x does not change y or the digest
```

`copy.bytes()` returns independently owned mutable bytes. Use the seal or its canonical string as a native `Map`/`Set` key. A second copy has a different reference and does not retrieve an entry keyed by the first array.

## Stable byte observations

Configure `.copy({ bytes: ... })` on either `defineSeal` or `defineMint`. Each named producer is lazy. On its first successful call, the library validates the result and copies its bytes into a private snapshot. Each call, including the first, returns a new plain `Uint8Array` copied from that snapshot. The producer result and snapshot are never returned to callers.

Changing a returned array cannot affect the snapshot, another caller, or future copies. If the producer retained its original array, later changes to that array cannot affect the snapshot either. Each observation has its own snapshot for each sealed instance. Failed computation or validation is not cached; a later call retries. Recursive access to an observation while it is computing throws.

Only genuine `Uint8Array` output is accepted. Buffer output is accepted as byte input because it is a Uint8Array, but Buffer methods and type are not preserved. Subarrays copy only their visible bytes. Shared-memory-backed arrays are rejected, even if their public `buffer` property is overridden. Detached storage is rejected. Ordinary objects, ArrayBuffer, DataView, other typed arrays, dates, maps, sets, strings, functions, and promises are not copy outputs. No generic cloning facility is provided.

The facade is stable, frozen, and bound to the value; a detached method still works. An absent or empty copy declaration exposes no `copy` member. `.docs()`, `.view()`, and `.copy()` may be used in any order before `.seal()`.

## Meaning and ownership

The definition author chooses what the bytes mean. The library enforces stable contents after the first successful computation and independent storage. It cannot prove producer purity, correct encoding, semantic equivalence, absence of side effects, or producer correctness.

Zod codecs remain the external representation boundary. Views remain stable immutable observations. Copy observations only supply fresh mutable byte storage; they do not add a mint codec or change serialization rules.

`Uint8Array` and Node Buffer remain unsupported view outputs and semantic Parts. Keep canonical string Parts for digests. Never return a mutable cached buffer through view.

## Cost and reference identity

The first call runs the producer and allocates a private byte snapshot. Every call allocates and fills a fresh Uint8Array. The snapshot remains in memory while its sealed value remains reachable. This storage and copying cost is intentional.

In React, `[digest]` and `[digest.view.hex]` are stable dependencies for an unchanged semantic value. `[digest.copy.bytes()]` creates a different dependency on every render. If a component needs a stable local buffer, it can use `useMemo(() => digest.copy.bytes(), [digest])`; that buffer still belongs to the component and remains mutable. See [framework guidance](frameworks.md).
