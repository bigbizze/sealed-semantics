import { z } from 'zod';
import * as fc from 'fast-check';
import { defineSeal, defineMint, type ValueOf } from '../src/index.js';
import { assertValueLaws, assertMintedLaws } from '../src/laws.js';
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
const Id = defineSeal({
  key: (parts) => parts,
  name: 'types/id',
  schema: z.string(),
  debug: (s) => {
    type Input = Assert<Equal<typeof s, string>>;
    return s;
  },
})
  .view({
    length: (s) => {
      type Input = Assert<Equal<typeof s, string>>;
      return s.length;
    },
  })
  .docs({
    examples: [{ input: 'x', encoded: 'x' }],
    view: { length: { description: 'Length', example: 1 } },
  })
  .seal();
const Other = defineSeal({
  key: (parts) => parts,
  name: 'types/other',
  schema: z.string(),
}).seal();
type Id = ValueOf<typeof Id>;
const id = Id.codec.parse('x');
type In = Assert<Equal<z.input<typeof Id.codec>, string>>;
type Out = Assert<Equal<z.output<typeof Id.codec>, Id>>;
type Projection = Assert<Equal<typeof id.view.length, number>>;
// @ts-expect-error Different kinds cannot be substituted.
const wrong: ValueOf<typeof Other> = id;
// @ts-expect-error Raw strings are not sealed values.
const raw: Id = 'x';
// @ts-expect-error Zod encode requires the specific sealed kind.
z.encode(Id.codec, Other.codec.parse('x'));
// @ts-expect-error Zod decode requires the schema input type.
z.decode(Id.codec, 123);
// parse accepts unknown at a boundary.
Id.codec.safeParse(123);
// @ts-expect-error The kind has no parse method.
Id.parse('x');
// @ts-expect-error The kind has no parseOrThrow method.
Id.parseOrThrow('x');
// @ts-expect-error Encoding belongs to Zod.
id.encode();
const converted = defineSeal({
  name: 'types/converted',
  key: (p) => p.count,
  schema: z.codec(z.string(), z.object({ count: z.number() }), {
    decode: (s) => ({ count: Number(s) }),
    encode: (p) => String(p.count),
  }),
})
  .view({
    count: (p) => {
      type Parts = Assert<Equal<typeof p, { count: number }>>;
      return p.count;
    },
  })
  .seal();
type ConvertedInput = Assert<Equal<z.input<typeof converted.codec>, string>>;
type Count = Assert<Equal<ValueOf<typeof converted>['view']['count'], number>>;
const allocated = defineSeal({
  key: (parts) => parts,
  name: 'types/allocate',
  schema: z.string(),
  allocate: (n: number, prefix: string) => `${prefix}${n}`,
}).seal();
type Allocated = Assert<
  Equal<ReturnType<typeof allocated.allocate>, ValueOf<typeof allocated>>
>;
allocated.allocate(1, 'x');
// @ts-expect-error Allocator arguments remain exact.
allocated.allocate('x', 1);
// @ts-expect-error An allocator is not present unless configured.
Id.allocate();
const Minted = defineMint({
  name: 'types/minted',
  mint: (input: { id: Id; other: ValueOf<typeof Other> }) => ({
    ok: true,
    value: input,
  }),
})
  .view({ id: (p) => p.id, other: (p) => p.other })
  .seal();
const minted = Minted.mint({ id, other: Other.codec.parse('x') });
if (minted.ok) {
  type Child = Assert<Equal<typeof minted.value.view.id, Id>>;
  // @ts-expect-error Minted values have no boundary codec.
  z.encode(Minted.codec, minted.value);
}
// @ts-expect-error Both kinds are required.
Minted.mint({ id });
// @ts-expect-error Runtime identity is not an arbitrary object shape.
Minted.mint({ id: 'x', other: 'x' });
// @ts-expect-error Complete the builder first.
type Unfinished = ValueOf<ReturnType<typeof defineMint>>;
const B = defineSeal({ key: (parts) => parts, name: 'types/docs', schema: z.string() });
defineSeal({
  key: (parts) => parts,
  name: 'types/no-decode',
  schema: z.string(),
  // @ts-expect-error Copies belong in the schema codec.
  decode: (s: string) => s,
});
defineSeal({
  key: (parts) => parts,
  name: 'types/no-encode',
  schema: z.string(),
  // @ts-expect-error Copies belong in the schema codec.
  encode: (s: string) => s,
});
// @ts-expect-error Schema input must be JSON, not any.
defineSeal({ key: (parts) => parts, name: 'types/any', schema: z.any() });
// @ts-expect-error Raw dates are not JSON input. Decode a string schema into Date Parts instead.
defineSeal({ key: (parts) => parts, name: 'types/date', schema: z.date() });
// @ts-expect-error Kind identity must be a literal.
defineSeal({ key: (parts) => parts, name: '' as string, schema: z.string() });
// @ts-expect-error Examples must be non-empty.
B.docs({ examples: [] });
// @ts-expect-error Encoded output is required.
B.docs({ examples: [{ input: 'x' }] });
// @ts-expect-error Examples follow the input schema type.
B.docs({ examples: [{ input: 1, encoded: 'x' }] });
// @ts-expect-error Unknown example properties are rejected.
B.docs({ examples: [{ input: 'x', encoded: 'x', surprise: 'x' }] });
// @ts-expect-error No declared view.
B.docs({ examples: [{ input: 'x', encoded: 'x' }], view: {} }).seal();
const V = B.view({ size: (s) => s.length });
// @ts-expect-error Every projection needs a description.
V.docs({ examples: [{ input: 'x', encoded: 'x' }], view: {} });
V.docs({
  examples: [{ input: 'x', encoded: 'x' }],
  // @ts-expect-error Projection samples retain their types.
  view: { size: { description: 'Size', example: 'x' } },
});
V.docs({
  examples: [{ input: 'x', encoded: 'x' }],
  // @ts-expect-error Unknown documentation keys are rejected.
  view: { size: { description: 'Size' }, extra: { description: 'No' } },
});
// @ts-expect-error Standard operations cannot be projections.
B.view({ debug: (s: string) => s });
// @ts-expect-error Symbol projections are forbidden.
B.view({ [Symbol.iterator]: (s: string) => s });
defineMint({
  name: 'types/minted-schema',
  mint: () => ({ ok: true, value: 1 }),
  // @ts-expect-error Minted definitions have no schema.
  schema: z.string(),
});
assertValueLaws(Id, { validWire: fc.string() });
assertValueLaws(allocated, {
  validWire: fc.string(),
  allocateArgs: fc.tuple(fc.integer(), fc.string()),
});
// @ts-expect-error Generator input must match the schema.
assertValueLaws(Id, { validWire: fc.integer() });
// @ts-expect-error No allocator exists.
assertValueLaws(Id, { validWire: fc.string(), allocateArgs: fc.constant([]) });
// @ts-expect-error This minted input requires both IDs.
assertMintedLaws(Minted, { validInput: fc.constant({ id }) });

// @ts-expect-error Non-primitive Parts require a semantic key.
defineSeal({
  name: 'types/missing-key',
  schema: z.object({ x: z.number() }),
});
// Primitive identity is explicit too.
defineSeal({ name: 'types/primitive-key', schema: z.string(), key: (s: string) => s });
defineSeal({
  name: 'types/object-key',
  schema: z.object({ x: z.number() }),
  // @ts-expect-error Keys must be supported primitives.
  key: (p) => p,
});
// @ts-expect-error A union containing an object requires key.
defineSeal({
  name: 'types/union-key',
  schema: z.union([z.string(), z.object({ x: z.number() })]),
});
// @ts-expect-error Values have no independent comparator.
id.equals(id);
// @ts-expect-error Native collections use reference identity.
Id.map();
// @ts-expect-error Native collections use reference identity.
Id.set();
const Structured = defineMint({
  name: 'types/structured',
  mint: () => ({ ok: true, value: { users: [id], nested: { list: [1] } } }),
})
  .view({ users: (p) => p.users, nested: (p) => p.nested })
  .seal();
const r = Structured.mint(undefined);
if (r.ok) {
  type Exact = Assert<Equal<typeof r.value.view.users, readonly Id[]>>;
  // @ts-expect-error Array observations are readonly.
  r.value.view.users.push(id);
  // @ts-expect-error Nested observations are readonly.
  r.value.view.nested.list[0] = 2;
}
// @ts-expect-error Date observations are unsupported.
B.view({ date: () => new Date() });
// @ts-expect-error Function observations are unsupported.
B.view({ fn: () => () => 0 });
// @ts-expect-error Nested mutable class observations are unsupported.
B.view({ nested: () => ({ map: new Map() }) });
defineMint({
  name: 'types/minted-key',
  mint: () => ({ ok: true, value: 1 }),
  // @ts-expect-error Mint events have no semantic key.
  key: () => 1,
});

// Producer-owned failures preserve their exact type throughout view/docs/seal.
import type { ProducerResult } from '../src/index.js';
type PaymentError = { code: 'unauthorized' } | { code: 'expired'; expiredAt: Date };
const Payment = defineMint({
  name: 'types/payment',
  mint: (input: string): ProducerResult<{ input: string }, PaymentError> =>
    input
      ? { ok: true, value: { input } }
      : { ok: false, error: { code: 'unauthorized' } },
})
  .view({ input: (p) => p.input })
  .docs({ view: { input: { description: 'Payment input.' } } })
  .seal();
const payment = Payment.mint('');
if (!payment.ok) {
  type Exact = Assert<Equal<typeof payment.error, PaymentError>>;
  if (payment.error.code === 'expired') {
    type DateType = Assert<Equal<typeof payment.error.expiredAt, Date>>;
  }
}
const Single = defineMint({
  name: 'types/single-error',
  mint: (s: string) =>
    s
      ? { ok: true as const, value: s }
      : { ok: false as const, error: { code: 'bad_input' as const, detail: s } },
}).seal();
const single = Single.mint('');
if (!single.ok) {
  type Exact = Assert<
    Equal<typeof single.error, { code: 'bad_input'; detail: string }>
  >;
}
const PrimitiveError = defineMint({
  name: 'types/primitive-error',
  mint: (s: string) => ({
    ok: false as const,
    error: s ? ('expired' as const) : ('unauthorized' as const),
  }),
}).seal();
const primitiveError = PrimitiveError.mint('');
if (!primitiveError.ok) {
  type Exact = Assert<Equal<typeof primitiveError.error, 'expired' | 'unauthorized'>>;
}
const Infallible = defineMint({
  name: 'types/infallible',
  mint: (input: string) => ({ ok: true as const, value: { input } }),
}).seal();
const infallible = Infallible.mint('');
if (!infallible.ok) {
  type NoError = Assert<Equal<typeof infallible.error, never>>;
}
type SuccessfulParts = Assert<Equal<ValueOf<typeof Payment>['view']['input'], string>>;

const unionProducer = (input: number) => {
  if (input < 0)
    return { ok: false as const, error: { code: 'unauthorized' as const } };
  if (input === 0)
    return { ok: false as const, error: { code: 'stale' as const, age: 42 } };
  return { ok: true as const, value: { input } };
};
const UnionMint = defineMint({
  name: 'types/inferred-union',
  mint: unionProducer,
}).seal();
const unionResult = UnionMint.mint(0);
if (!unionResult.ok) {
  type Exact = Assert<
    Equal<
      typeof unionResult.error,
      Extract<ReturnType<typeof unionProducer>, { ok: false }>['error']
    >
  >;
  if (unionResult.error.code === 'stale') {
    type Age = Assert<Equal<typeof unionResult.error.age, number>>;
  }
}
// @ts-expect-error The package does not prescribe a producer error taxonomy.
import type { ValueError } from '../src/index.js';

// @ts-expect-error Primitive Parts also require key.
defineSeal({ name: 'types/missing-primitive-key', schema: z.string() });

const docsFirst = defineSeal({
  name: 'types/docs-first',
  schema: z.string(),
  key: (s) => s,
})
  .docs({
    examples: [{ input: 'x', encoded: 'x' }],
    view: { text: { description: 'Text', example: 'x' } },
  })
  .view({ text: (s) => s })
  .seal();
const textFromDocsFirst: string = docsFirst.codec.parse('x').view.text;
const mintDocsFirst = defineMint({
  name: 'types/mint-docs-first',
  mint: (s: string) => ({ ok: true as const, value: s }),
})
  .docs({ view: { text: { description: 'Text', example: 'x' } } })
  .view({ text: (s) => s })
  .seal();
const mismatchedDocs = B.docs({
  examples: [{ input: 'x', encoded: 'x' }],
  view: { text: { description: 'Text', example: 42 } },
}).view({ text: (s) => s });
// @ts-expect-error The final string projection cannot have a numeric documentation example.
mismatchedDocs.seal();
const missingDocs = B.docs({ examples: [{ input: 'x', encoded: 'x' }] }).view({
  text: (s) => s,
});
// @ts-expect-error Every final projection needs documentation when docs are supplied.
missingDocs.seal();
const extraDocs = B.docs({
  examples: [{ input: 'x', encoded: 'x' }],
  view: { text: { description: 'Text' }, extra: { description: 'Extra' } },
}).view({ text: (s) => s });
// @ts-expect-error Documentation cannot name a projection absent from the final view.
extraDocs.seal();
// @ts-expect-error Completed definitions have no builder methods.
docsFirst.view({});
// @ts-expect-error Completed definitions have no builder methods.
docsFirst.docs({});
// @ts-expect-error Completed definitions cannot be sealed again.
mintDocsFirst.seal();

const CopyExample = defineSeal({
  name: 'copy/types',
  schema: z.string(),
  key: (s) => s,
})
  .copy({
    bytes: (s) => new TextEncoder().encode(s),
    signatureBytes: () => Buffer.from([1, 2]),
  })
  .seal();
const copies = CopyExample.codec.parse('x');
const bytes: Uint8Array = copies.copy.bytes();
const signatureBytes: Uint8Array = copies.copy.signatureBytes();
// @ts-expect-error Buffer producer output is exposed only as Uint8Array.
const nodeBuffer: Buffer = copies.copy.signatureBytes();
// @ts-expect-error Undeclared copy observations are absent.
copies.copy.missing();
defineSeal({ name: 'copy/string', schema: z.string(), key: (s) => s }).copy({
  // @ts-expect-error Text belongs in view.
  string: (s) => s,
});
defineSeal({ name: 'copy/object', schema: z.string(), key: (s) => s }).copy({
  // @ts-expect-error Plain data belongs in view.
  data: (s) => ({ s }),
});
defineSeal({ name: 'copy/array', schema: z.string(), key: (s) => s }).copy({
  // @ts-expect-error Arrays belong in view.
  data: (s) => [s],
});
defineSeal({ name: 'copy/function', schema: z.string(), key: (s) => s }).copy({
  // @ts-expect-error Functions cannot be copied.
  data: () => () => 1,
});
defineSeal({ name: 'copy/shared', schema: z.string(), key: (s) => s }).copy({
  // @ts-expect-error Shared memory cannot be copied.
  data: () => new SharedArrayBuffer(1),
});
// @ts-expect-error Sealing completes the builder.
CopyExample.copy({});

defineSeal({ name: 'copy/arraybuffer', schema: z.string(), key: (s) => s }).copy({
  // @ts-expect-error Only Uint8Array is a copy output.
  bytes: () => new ArrayBuffer(32),
});
defineSeal({ name: 'copy/uint32', schema: z.string(), key: (s) => s }).copy({
  // @ts-expect-error Only Uint8Array is a copy output.
  bytes: () => new Uint32Array([1, 2]),
});
const NoCopies = defineSeal({
  name: 'copy/absent',
  schema: z.string(),
  key: (s) => s,
}).seal();
// @ts-expect-error No copy observations were declared.
NoCopies.codec.parse('x').copy;
