import { z } from 'zod';
import * as fc from 'fast-check';
import { defineKind, defineMinted, type ValueOf } from '../src/index.js';
import { assertValueLaws, assertMintedLaws } from '../src/laws.js';
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
const Id = defineKind({
  kind: 'types/id',
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
const Other = defineKind({ kind: 'types/other', schema: z.string() }).seal();
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
// @ts-expect-error No standard canonical operation.
id.canonical();
const converted = defineKind({
  kind: 'types/converted',
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
const allocated = defineKind({
  kind: 'types/allocate',
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
const Minted = defineMinted({
  kind: 'types/minted',
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
type Unfinished = ValueOf<ReturnType<typeof defineMinted>>;
const B = defineKind({ kind: 'types/docs', schema: z.string() });
defineKind({
  kind: 'types/no-canonical',
  schema: z.string(),
  // @ts-expect-error Canonical callbacks were removed.
  canonical: (s: string) => s,
});
// @ts-expect-error Conversions belong in the schema codec.
defineKind({ kind: 'types/no-decode', schema: z.string(), decode: (s: string) => s });
// @ts-expect-error Conversions belong in the schema codec.
defineKind({ kind: 'types/no-encode', schema: z.string(), encode: (s: string) => s });
// @ts-expect-error Schema input must be JSON, not any.
defineKind({ kind: 'types/any', schema: z.any() });
// @ts-expect-error Raw dates are not JSON input. A string-to-date codec works.
defineKind({ kind: 'types/date', schema: z.date() });
const date = defineKind({
  kind: 'types/date-codec',
  schema: z.codec(z.string(), z.date(), {
    decode: (s) => new Date(s),
    encode: (d) => d.toISOString(),
  }),
}).view({ year: (d) => d.getUTCFullYear() });
// @ts-expect-error Kind identity must be a literal.
defineKind({ kind: '' as string, schema: z.string() });
// @ts-expect-error Examples must be non-empty.
B.docs({ examples: [] });
// @ts-expect-error Encoded output is required.
B.docs({ examples: [{ input: 'x' }] });
// @ts-expect-error Examples follow the input schema type.
B.docs({ examples: [{ input: 1, encoded: 'x' }] });
// @ts-expect-error No canonical examples.
B.docs({ examples: [{ input: 'x', encoded: 'x', canonical: 'x' }] });
// @ts-expect-error No declared view.
B.docs({ examples: [{ input: 'x', encoded: 'x' }], view: {} });
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
B.view({ equals: (s: string) => s });
// @ts-expect-error Symbol projections are forbidden.
B.view({ [Symbol.iterator]: (s: string) => s });
defineMinted({
  kind: 'types/minted-schema',
  mint: () => ({ ok: true, value: 1 }),
  // @ts-expect-error Minted definitions have no schema.
  schema: z.string(),
});
assertValueLaws(Id, {
  validWire: fc.string(),
  projectionMutators: {
    view: {
      length: (n) => {
        type N = Assert<Equal<typeof n, number>>;
      },
    },
  },
});
assertValueLaws(allocated, {
  validWire: fc.string(),
  allocateArgs: fc.tuple(fc.integer(), fc.string()),
});
// @ts-expect-error Generator input must match the schema.
assertValueLaws(Id, { validWire: fc.integer() });
// @ts-expect-error No allocator exists.
assertValueLaws(Id, { validWire: fc.string(), allocateArgs: fc.constant([]) });
assertValueLaws(Id, {
  validWire: fc.string(),
  // @ts-expect-error Only declared view projections have mutators.
  projectionMutators: { view: { unknown: () => {} } },
});
assertValueLaws(Id, {
  validWire: fc.string(),
  // @ts-expect-error Canonical mutators were removed.
  projectionMutators: { canonical: () => {} },
});
// @ts-expect-error This minted input requires both IDs.
assertMintedLaws(Minted, { validInput: fc.constant({ id }) });
// @ts-expect-error Old exports are absent.
import { defineValue, defineDerived, defineAttested } from '../src/index.js';
// @ts-expect-error Old law names are absent.
import { assertDerivedLaws, assertAttestedLaws } from '../src/laws.js';
