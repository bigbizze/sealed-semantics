# canonical-type

Semantic values and local derived proofs with private state and explicit encoding.
Requires Node 22+, TypeScript 5.7+, and Zod 4.1.x or 4.x.

```sh
npm install canonical-type zod
```

The producer stage establishes Parts; `.with(...)` then infers every projection parameter.
Only `.with(...)` completes the definition. Choose stable, namespaced kind literals.

```ts
import { z } from 'zod';
import { defineValue, defineDerived, ok, err, type ValueOf } from 'canonical-type';

const normalizeUserSpelling = (w: string) =>
  w.startsWith('user:') ? `usr_${w.slice(5).replaceAll('-', '')}` : w;
const UserId = defineValue({
  kind: 'example/user-id',
  wire: z.string().regex(/^(usr_[a-f0-9]{16,}|user:[0-9a-f-]{36})$/),
  decode: w => {
    const spelling = normalizeUserSpelling(w);
    return /^usr_[a-f0-9]{16,}$/.test(spelling) ? ok({ spelling }) :
      err({ kind: 'example/user-id', reason: 'invalid_parts', issues: ['Invalid alias'] } as const);
  },
}).with({
  toWireShape: p => p.spelling,
  allocate: () => `user:${crypto.randomUUID()}`,
  canonical: p => ({ type: 'utf8', value: p.spelling }),
  debug: p => `user(…${p.spelling.slice(-6)})`,
});
type UserId = ValueOf<typeof UserId>;

const hexToBytes = (hex: string) =>
  Uint8Array.from(hex.match(/../g)!, pair => parseInt(pair, 16));
const bytesToHex = (bytes: Uint8Array) =>
  [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const constantTimeEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}; // Full byte scan; JavaScript provides no timing guarantee.
const Sha256Digest = defineValue({
  kind: 'example/sha256',
  wire: z.string().regex(/^[a-f0-9]{64}$/),
  decode: hex => ok({ bytes: hexToBytes(hex) }),
}).with({
  toWireShape: p => bytesToHex(p.bytes),
  equals: (a, b) => constantTimeEqual(a.bytes, b.bytes),
  canonical: p => ({ type: 'bytes', value: p.bytes.slice() }),
});
const NamespaceId = defineValue({
  kind: 'example/namespace-id', wire: z.string().regex(/^ns:[a-z]+$/),
  decode: w => ok(w),
}).with({ toWireShape: p => p });
const ContentAddress = defineValue({
  kind: 'example/content-address',
  wire: z.object({
    namespace_id: NamespaceId.wire,
    content_class: z.enum(['primary', 'attachment']),
    digest: Sha256Digest.wire,
  }),
  decode: w => ok(w), // Nested values are already sealed.
}).with({
  toWireShape: p => p, // Zod encodes nested values backward.
  fields: {
    namespace: p => p.namespace_id,
    contentClass: p => p.content_class,
    digest: p => p.digest,
  },
});
type ContentAddress = ValueOf<typeof ContentAddress>;

type WriteRows = { id: string; content: ContentAddress }[];
type PrepareInput = { rows: WriteRows; content: ContentAddress[] };
const copyWriteRows = (rows: WriteRows): WriteRows => rows.map(row => ({ ...row }));
const PreparedWrite = defineDerived({
  kind: 'example/prepared-write',
  derive: (input: PrepareInput) => ok({
    rows: copyWriteRows(input.rows), contentToRetain: [...input.content],
  }),
}).with({ fields: {
  rows: p => copyWriteRows(p.rows) as Readonly<WriteRows>,
  contentToRetain: p => [...p.contentToRetain] as readonly ContentAddress[],
} });
export const prepareWrite = PreparedWrite.derive;
type CommitIo = { write(rows: Readonly<WriteRows>): void };
export function commitWrite(plan: ValueOf<typeof PreparedWrite>, io: CommitIo) {
  io.write(plan.view.rows());
}
const parsed = UserId.parse('usr_0123456789abcdef');
if (parsed.ok) {
  const userId = parsed.value;
  const raw = userId.encode();
  const canonical = userId.canonical();
  const users = UserId.map<string>();
  users.set(userId, "example");
  const seen = UserId.set().add(userId);
  const ResponseSchema = z.object({ user_id: UserId.wire });
  const response = z.encode(ResponseSchema, { user_id: parsed.value });
}
```

`parse`, `allocate`, and `derive` return `Result`. Producers reject inputs with `err`.
Zod's `z.decode`, `z.encode`, `z.safeDecode`, and `z.safeEncode` work with `Kind.wire`.
`JSON.stringify(value)`, implicit coercion, and recovered constructors throw.
`Kind.map<V>()` and `Kind.set()` compare semantic keys by normalized wire data and derived keys by identity.
Collections retain runtime kind validation. `ValueMap` and `ValueSet` are type-only exports.
Declared fields are called through `value.view.*`; no standard methods live inside `view`.
The facade is privately cached, frozen, and null-prototype; definitions without fields have no `view`.
Reserved field names receive a descriptive compiler error. Canonical output is `value.canonical()`.
Pass sealed values directly into derivations. Encode only when a boundary needs raw data.
They provide get/set or add, has, delete, clear, size, iteration, and forEach as applicable.

Producers must own Parts exclusively, never mutate them, and copy mutable projections.
Neither constructor proves existence, permission, currentness, or storage success.
See [accepted amendments](docs/amendments.md), [guarantees](docs/guarantees.md), [laws](docs/laws.md), and [type viability](docs/viability.md).

For consumer law tests, install `fast-check` as a dev dependency and import the harness from `canonical-type/laws`.
Supply valid input generators, equivalent alias pairs, and mutators for custom mutable projections.
Run `npx check-kinds 'src/**/*.ts' 'other-root/**/*.ts'` in CI across all owned roots.
The scan detects direct literal kinds on calls named defineValue/defineDerived, including qualified calls.
It does not resolve renamed imports, computed expressions, generated code, or dependency source automatically.

Development: `npm ci`, then `npm run check`. See [release checks](docs/releasing.md).
