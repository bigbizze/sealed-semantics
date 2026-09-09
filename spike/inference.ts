import { z } from 'zod';
import { defineValue, defineDerived, ok } from '../src/index.js';
import type { ValueOf } from '../src/types.js';
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
const UserId = defineValue({
  kind: 'example/user-id',
  wire: z.string(),
  decode: (w) => {
    type Input = Assert<Equal<typeof w, string>>;
    return ok({ spelling: w });
  },
}).with({
  toWireShape: (p) => {
    type Parts = Assert<Equal<typeof p, { spelling: string }>>;
    return p.spelling;
  },
  allocate: (gen: () => string) => gen(),
  canonical: (p) => ({ type: 'utf8', value: p.spelling }),
  debug: (p) => p.spelling,
});
const Sha256Digest = defineValue({
  kind: 'example/sha256',
  wire: z.string(),
  decode: (hex) => ok({ bytes: Uint8Array.from(hex, (c) => c.charCodeAt(0)) }),
}).with({
  toWireShape: (p) => String(p.bytes.length),
  equals: (a, b) => {
    type A = Assert<Equal<typeof a, { bytes: Uint8Array<ArrayBuffer> }>>;
    type B = Assert<Equal<typeof b, typeof a>>;
    return a.bytes.length === b.bytes.length;
  },
  canonical: (p) => ({ type: 'bytes', value: p.bytes.slice() }),
});
const NamespaceId = defineValue({
  kind: 'example/namespace',
  wire: z.string(),
  decode: (w) => ok(w),
}).with({ toWireShape: (p) => p });
const ContentAddress = defineValue({
  kind: 'example/content-address',
  wire: z.object({
    namespace_id: NamespaceId.wire,
    content_class: z.enum(['primary', 'attachment']),
    digest: Sha256Digest.wire,
  }),
  decode: (w) => {
    type Nested = Assert<Equal<typeof w.digest, ValueOf<typeof Sha256Digest>>>;
    return ok(w);
  },
}).with({
  toWireShape: (p) => p,
  view: {
    namespace: (p) => p.namespace_id,
    contentClass: (p) => p.content_class,
    digest: (p) => p.digest,
  },
});
interface PrepareInput {
  rows: string[];
  content: ValueOf<typeof ContentAddress>[];
}
const PreparedWrite = defineDerived({
  kind: 'example/prepared-write',
  derive: (input: PrepareInput) =>
    ok({ rows: [...input.rows], contentToRetain: [...input.content] }),
}).with({
  view: {
    rows: (p) => {
      type Parts = Assert<
        Equal<
          typeof p,
          { rows: string[]; contentToRetain: ValueOf<typeof ContentAddress>[] }
        >
      >;
      return [...p.rows] as readonly string[];
    },
    contentToRetain: (p) =>
      [...p.contentToRetain] as readonly ValueOf<typeof ContentAddress>[],
  },
});
type Allocation = Assert<
  Equal<Parameters<typeof UserId.allocate>, [gen: () => string]>
>;
type Canonical = Assert<
  Equal<
    ReturnType<ValueOf<typeof UserId>['canonical']>,
    { type: string; value: string }
  >
>;
type Field = Assert<
  Equal<
    ValueOf<typeof ContentAddress>['view']['contentClass'],
    'primary' | 'attachment'
  >
>;
type ReadonlyField = Assert<
  Equal<ValueOf<typeof PreparedWrite>['view']['rows'], readonly string[]>
>;
type Raw = Assert<
  Equal<
    z.input<typeof ContentAddress.wire>,
    { namespace_id: string; content_class: 'primary' | 'attachment'; digest: string }
  >
>;
declare const user: ValueOf<typeof UserId>;
declare const digest: ValueOf<typeof Sha256Digest>;
// @ts-expect-error distinct kind
user.equals(digest);
// @ts-expect-error distinct kind
const wrong: ValueOf<typeof UserId> = digest;
// @ts-expect-error non-JSON input
defineValue({ kind: 'bad/date', wire: z.date(), decode: (w) => ok(w) });
// @ts-expect-error no representation access
UserId.parts;
// @ts-expect-error exact allocator parameters
UserId.allocate(4);
// @ts-expect-error derived values have no wire
PreparedWrite.wire;
const Mutable = defineDerived({
  kind: 'example/mutable-type',
  derive: (s: string) => ok({ items: [s] }),
}).with({ view: { items: (p) => [...p.items] } });
type MutableField = Assert<Equal<ValueOf<typeof Mutable>['view']['items'], string[]>>;
// Errors must appear at the configured item, without casts or manual generics.
defineValue({
  kind: 'invalid/output',
  wire: z.string(),
  decode: (w) => ok({ spelling: w }),
}).with({
  // @ts-expect-error decoded wire output is string
  toWireShape: (p) => 42,
});
defineValue({
  kind: 'invalid/parts-use',
  wire: z.string(),
  decode: (w) => ok({ spelling: w }),
}).with({
  toWireShape: (p) => p.spelling,
  view: {
    // @ts-expect-error field receives known Parts
    bad: (p) => p.missing,
  },
});
defineValue({ kind: 'invalid/allocator', wire: z.string(), decode: (w) => ok(w) }).with(
  {
    toWireShape: (p) => p,
    // @ts-expect-error allocator must return raw string
    allocate: () => 42,
  },
);
defineValue({
  kind: 'invalid/unknown-option',
  wire: z.string(),
  decode: (w) => ok(w),
}).with({
  toWireShape: (p) => p,
  // @ts-expect-error reject misspelled option instead of silently ignoring it
  canoncal: (p) => p,
});
defineDerived({ kind: 'invalid/derived-option', derive: (x: string) => ok(x) }).with({
  // @ts-expect-error derived values cannot declare canonical
  canonical: (p: string) => p,
});
defineDerived({ kind: 'invalid/reserved-field', derive: (x: string) => ok(x) }).with({
  view: {
    // @ts-expect-error view cannot overwrite kind operations
    is: (p) => p,
  },
});
defineValue({
  kind: 'invalid/error',
  wire: z.string(),
  // @ts-expect-error invalid producer error shape
  decode: (w) => ({ ok: false, error: 'bad' }),
});
// @ts-expect-error reject unknown JSON schema
defineValue({ kind: 'invalid/unknown', wire: z.unknown(), decode: (w) => ok(w) });
// @ts-expect-error reject bigint JSON schema
defineValue({ kind: 'invalid/bigint', wire: z.bigint(), decode: (w) => ok(w) });
defineValue({
  kind: 'invalid/optional',
  // @ts-expect-error reject optional JSON boundary
  wire: z.string().optional(),
  decode: (w) => ok(w),
});
declare const widenedKind: string;
// @ts-expect-error literal kind is necessary for nominal identity
defineValue({ kind: widenedKind, wire: z.string(), decode: (w) => ok(w) });
const Same = defineValue({
  kind: 'example/user-id',
  wire: z.string(),
  decode: (w) => ok(w),
}).with({ toWireShape: (p) => p });
const sameBrand: ValueOf<typeof Same> = user; // Same brand; additional declared methods affect the complete surface.
// @ts-expect-error values do not expose raw state
user.raw;
// @ts-expect-error values do not expose collection keys
user.indexKey;
// @ts-expect-error kinds do not expose whole Parts
UserId.unwrap;
declare const prepared: ValueOf<typeof PreparedWrite>;
// @ts-expect-error derived instances cannot encode
prepared.encode();
// @ts-expect-error unrelated structured data lacks the nominal brand
const structural: ValueOf<typeof UserId> = {
  encode: () => '',
  equals: () => true,
  debug: () => '',
  toJSON: () => {
    throw Error();
  },
  valueOf: () => {
    throw Error();
  },
  [Symbol.toPrimitive]: () => {
    throw Error();
  },
};
// Amended instance and kind surfaces must remain exact.
const zero = defineValue({
  kind: 'amendment/zero',
  wire: z.string(),
  decode: (w) => ok(w),
}).with({ toWireShape: (p) => p, allocate: () => 'x' });
type ZeroArgs = Assert<Equal<Parameters<typeof zero.allocate>, []>>;
const empty = defineDerived({ kind: 'amendment/empty', derive: () => ok(0) }).with({
  view: {},
});
declare const emptyValue: ValueOf<typeof empty>;
// @ts-expect-error no view means no view
emptyValue.view;
// @ts-expect-error canonical alone does not add view
user.view;
// @ts-expect-error moved to instance
UserId.canonical(user);
// @ts-expect-error moved to view
ContentAddress.digest;
// @ts-expect-error derived has no canonical
prepared.canonical();
declare const address: ValueOf<typeof ContentAddress>;
// @ts-expect-error top-level standard method is not available inside view
address.view.encode;
// @ts-expect-error no generic Parts access
address.view.parts;
const users = UserId.map<number>();
users.set(user, 1);
// @ts-expect-error map values preserve their chosen type
users.set(user, 'wrong');
// @ts-expect-error map key must have the supplied kind
users.set(digest, 1);
// @ts-expect-error set key must have the supplied kind
UserId.set().add(digest);
defineDerived({ kind: 'amendment/bad-encode', derive: (s: string) => ok(s) }).with({
  view: {
    // @ts-expect-error descriptive reserved-name error on the configured field
    encode: (p) => p,
  },
});

defineDerived({ kind: 'amendment/symbol-type', derive: (s: string) => ok(s) }).with({
  view: {
    // @ts-expect-error view cannot declare symbol protocol methods
    [Symbol.toPrimitive]: (p: string) => p,
  },
});
// @ts-expect-error kind acquisition methods are readonly
UserId.parse = UserId.parse;
// @ts-expect-error kind predicates are readonly
UserId.is = UserId.is;
// @ts-expect-error kind allocators are readonly
UserId.allocate = UserId.allocate;
// @ts-expect-error kind collection factories are readonly
UserId.map = UserId.map;
// @ts-expect-error derived producers are readonly
PreparedWrite.derive = PreparedWrite.derive;
const frozenBuilder = defineDerived({
  kind: 'types/frozen-builder',
  derive: (s: string) => ok(s),
});
// @ts-expect-error builder operation is readonly
frozenBuilder.with = frozenBuilder.with;

const DocumentedUser = UserId.docs({
  description: 'A user identifier.',
  exampleWire: 'usr_0123456789abcdef',
  exampleCanonical: { type: 'utf8', value: 'usr_0123456789abcdef' },
});
type DocumentedValue = Assert<
  Equal<ValueOf<typeof DocumentedUser>, ValueOf<typeof UserId>>
>;
DocumentedUser.allocate(() => 'usr_0123456789abcdef');
// @ts-expect-error Documentation cannot change the inferred wire type.
UserId.docs({ exampleWire: 123 });
// @ts-expect-error Canonical examples must have the complete return shape.
UserId.docs({ exampleCanonical: { type: 'utf8' } });
// @ts-expect-error No canonical operation exists.
NamespaceId.docs({ exampleCanonical: 'ns:x' });
// @ts-expect-error No views exist.
NamespaceId.docs({ views: { suffix: { example: 'abc' } } });
// @ts-expect-error Documentation spelling is checked.
UserId.docs({ descriptin: 'typo' });
// @ts-expect-error Metadata container is readonly.
DocumentedUser.documentation.description = 'changed';
ContentAddress.docs({ views: { contentClass: { example: 'primary' } } });
// @ts-expect-error Projection example must match its inferred enum.
ContentAddress.docs({ views: { contentClass: { example: 'invalid' } } });
// @ts-expect-error Unknown projection name.
ContentAddress.docs({ views: { suffix: { example: 'abc' } } });
PreparedWrite.docs({ description: 'Local write proof.' });
// @ts-expect-error Derived kinds have no wire representation.
PreparedWrite.docs({ exampleWire: 'anything' });
// @ts-expect-error Projection properties are read-only.
address.view.contentClass = 'primary';
// @ts-expect-error A projection value is not a zero-argument method.
address.view.contentClass();
// @ts-expect-error Empty views do not accept projection documentation.
empty.docs({ views: { missing: { example: 1 } } });

ContentAddress.docs({
  exampleWire: {
    namespace_id: 'ns:example',
    content_class: 'primary',
    digest: 'abcdef',
  },
});
ContentAddress.docs({
  // @ts-expect-error Nested documentation uses raw wire, not a sealed child.
  exampleWire: { namespace_id: user, content_class: 'primary', digest: 'abcdef' },
});
// @ts-expect-error The former fields option is no longer accepted.
defineDerived({ kind: 'invalid/old-fields', derive: () => ok(0) }).with({ fields: {} });

const unfinishedValue = defineValue({
  kind: 'diagnostic/unfinished-value',
  wire: z.string(),
  decode: ok,
});
const unfinishedDerived = defineDerived({
  kind: 'diagnostic/unfinished-derived',
  derive: (s: string) => ok(s),
});
// @ts-expect-error Complete the semantic builder with .with first.
type UnfinishedValue = ValueOf<typeof unfinishedValue>;
// @ts-expect-error Complete the derived builder with .with first.
type UnfinishedDerived = ValueOf<typeof unfinishedDerived>;
// @ts-expect-error Arbitrary objects are still rejected, rather than silently becoming never.
type NotAKind = ValueOf<{ value: string }>;
// @ts-expect-error Named builders keep their frozen .with type.
unfinishedValue.with = unfinishedValue.with;
const finishedValue = unfinishedValue.with({ toWireShape: (p) => p });
type FinishedEncoding = Assert<
  Equal<ReturnType<ValueOf<typeof finishedValue>['encode']>, string>
>;
