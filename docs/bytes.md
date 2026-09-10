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
  .to({
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

const x = a.to.bytes();
const y = a.to.bytes();
console.log(x === y); // false: separate buffers with equal contents
x[0] = 0;
console.log(y[0]); // 171: changing x does not change y or the digest
```

This conversion returns a fresh mutable buffer. Its contents represent the sealed value, but its object identity has no semantic meaning. Use the seal or canonical string as a native `Map`/`Set` key. A second byte conversion does not retrieve an entry keyed by the first buffer.

`Uint8Array` and Node `Buffer` are not supported view outputs or semantic Parts. A cached mutable buffer would let a caller change later observations. Returning a fresh buffer on each view access would violate the stable-view contract. Freezing a populated typed array does not provide a solution: `Object.freeze` throws. Keep conversion outside `.view()`.

Hex decoding takes O(n) work and allocates a new buffer. A 32-byte digest uses 64 hex characters; base64url can represent it in 43 characters without padding. Pick one canonical spelling and validate it. Actual string and buffer memory costs depend on the engine and object overhead; this is not a performance guarantee.

If profiling shows repeated conversion matters, convert once in application code and reuse the buffer while consumers only read it. If an API may mutate or retain it, pass `bytes.slice()` to give that call its own copy. The returned buffer belongs to the caller.

In React, `[digest]` and `[digest.view.hex]` are stable dependencies for an unchanged semantic value. `[digest.to.bytes()]` allocates a different dependency on each render. If a component needs a stable buffer, it can use `useMemo(() => digest.to.bytes(), [digest])`; that buffer remains mutable and must be treated accordingly. See [framework guidance](frameworks.md).

## Owned conversions

Configure `.to({ bytes: ... })` on either `defineSeal` or `defineMint`. Call `value.to.bytes()` to obtain a fresh mutable result. The facade is stable, frozen, and bound to the value; a detached method still works. Each call runs the callback, validates its output, then deep-clones it with `structuredClone`. Even if the callback returns private state or a cached buffer, the caller receives an independent copy. No buffers are transferred or detached.

The top-level return must be `Date`, `Map`, `Set`, `ArrayBuffer`, a standard typed array, or `DataView`. Primitives, arrays, and plain objects belong in `view`, and are compile errors as conversion results. A `to.date()` is the supported way to expose a mutable Date. Functions and promises are rejected everywhere.

Map keys and collection contents may contain primitives, dense arrays, plain objects, and the supported built-ins. Shared references within one result are preserved. Cycles, sealed values, accessors, hidden/symbol properties, custom classes, extra properties on built-ins, and shared-memory buffers are rejected. Use `Uint8Array` instead of Node `Buffer`; application code can call `Buffer.from(digest.to.bytes())` if needed. Runtime checks are authoritative where TypeScript cannot distinguish a custom class structurally.

Deep cloning costs work and allocation proportional to the result graph. If a callback constructs a buffer, cloning adds another copy. Reuse a returned buffer locally when appropriate; conversion results intentionally have no stable reference identity.
