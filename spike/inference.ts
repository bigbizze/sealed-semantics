const ok = <T>(value: T) => ({ ok: true as const, value });
import { z } from 'zod';
import * as fc from 'fast-check';
import { assertValueLaws, assertDerivedLaws } from '../src/laws.js';
import { defineKind, defineDerived } from '../src/index.js';
import type { ValueOf } from '../src/types.js';
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
const UserIdBuilder = defineKind({
  kind: 'example/user-id',
  schema: z.string(),
  decode: (w) => {
    type Input = Assert<Equal<typeof w, string>>;
    return ok({ spelling: w });
  },
  encode: (p) => {
    type Parts = Assert<Equal<typeof p, { spelling: string }>>;
    return p.spelling;
  },
  allocate: (gen: () => string) => gen(),
  canonical: (p) => ({ type: 'utf8', value: p.spelling }),
  debug: (p) => p.spelling,
});
const UserId = UserIdBuilder.seal();
const Sha256Digest = defineKind({
  kind: 'example/sha256',
  schema: z.string(),
  decode: (hex) => ok({ bytes: Uint8Array.from(hex, (c) => c.charCodeAt(0)) }),
  encode: (p) => String(p.bytes.length),
  equals: (a, b) => {
    type A = Assert<Equal<typeof a, { bytes: Uint8Array<ArrayBuffer> }>>;
    type B = Assert<Equal<typeof b, typeof a>>;
    return a.bytes.length === b.bytes.length;
  },
  canonical: (p) => ({ type: 'bytes', value: p.bytes.slice() }),
}).seal();
const NamespaceIdBuilder = defineKind({
  kind: 'example/namespace',
  schema: z.string(),
  decode: (w) => ok(w),
  encode: (p) => p,
});
const NamespaceId = NamespaceIdBuilder.seal();
const ContentAddressBuilder = defineKind({
  kind: 'example/content-address',
  schema: z.object({
    namespace_id: NamespaceId.codec,
    content_class: z.enum(['primary', 'attachment']),
    digest: Sha256Digest.codec,
  }),
  decode: (w) => {
    type Nested = Assert<Equal<typeof w.digest, ValueOf<typeof Sha256Digest>>>;
    return ok(w);
  },
  encode: (p) => p,
}).view({
  namespace: (p) => p.namespace_id,
  contentClass: (p) => p.content_class,
  digest: (p) => p.digest,
});
const ContentAddress = ContentAddressBuilder.seal();
interface PrepareInput {
  rows: string[];
  content: ValueOf<typeof ContentAddress>[];
}
const PreparedWriteBuilder = defineDerived({
  kind: 'example/prepared-write',
  derive: (input: PrepareInput) =>
    ok({ rows: [...input.rows], contentToRetain: [...input.content] }),
}).view({
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
});
const PreparedWrite = PreparedWriteBuilder.seal();
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
    z.input<typeof ContentAddress.codec>,
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
defineKind({ kind: 'bad/date', schema: z.date(), decode: (w) => ok(w) });
// @ts-expect-error no representation access
UserId.parts;
// @ts-expect-error exact allocator parameters
UserId.allocate(4);
// @ts-expect-error derived values have no wire
PreparedWrite.codec;
const Mutable = defineDerived({
  kind: 'example/mutable-type',
  derive: (s: string) => ok({ items: [s] }),
})
  .view({ items: (p) => [...p.items] })
  .seal();
type MutableField = Assert<Equal<ValueOf<typeof Mutable>['view']['items'], string[]>>;
// Errors must appear at the configured item, without casts or manual generics.
defineKind({
  kind: 'invalid/output',
  schema: z.string(),
  decode: (w) => ok({ spelling: w }),
  // @ts-expect-error encoder must return schema output
  encode: (p) => 42,
}).seal();
defineKind({
  kind: 'invalid/parts-use',
  schema: z.string(),
  decode: (w) => ok({ spelling: w }),
  encode: (p) => p.spelling,
})
  .view({
    // @ts-expect-error field receives known Parts
    bad: (p) => p.missing,
  })
  .seal();
defineKind({
  kind: 'invalid/allocator',
  schema: z.string(),
  decode: (w: string) => ok(w),
  encode: (p) => p,
  // @ts-expect-error allocator must return schema input
  allocate: () => 42,
}).seal();
defineKind({
  kind: 'invalid/unknown-option',
  schema: z.string(),
  decode: (w: string) => ok(w),
  encode: (p) => p,
  // @ts-expect-error unknown option
  canoncal: (p: string) => p,
}).seal();
defineDerived({
  kind: 'invalid/derived-option',
  derive: (x: string) => ok(x),
  // @ts-expect-error derived cannot encode canonical
  canonical: (p: string) => p,
}).seal();
defineDerived({ kind: 'invalid/reserved-field', derive: (x: string) => ok(x) })
  .view({
    // @ts-expect-error view cannot overwrite kind operations
    is: (p) => p,
  })
  .seal();
defineKind({
  kind: 'invalid/error',
  schema: z.string(),
  // @ts-expect-error invalid producer error shape
  decode: (w) => ({ ok: false, error: 'bad' }),
});
// @ts-expect-error reject unknown JSON schema
defineKind({ kind: 'invalid/unknown', schema: z.unknown(), decode: (w) => ok(w) });
// @ts-expect-error reject bigint JSON schema
defineKind({ kind: 'invalid/bigint', schema: z.bigint(), decode: (w) => ok(w) });
defineKind({
  kind: 'invalid/optional',
  // @ts-expect-error reject optional JSON boundary
  schema: z.string().optional(),
  decode: (w) => ok(w),
});
declare const widenedKind: string;
// @ts-expect-error literal kind is necessary for nominal identity
defineKind({ kind: widenedKind, schema: z.string(), decode: (w) => ok(w) });
const Same = defineKind({
  kind: 'example/user-id',
  schema: z.string(),
  decode: (w) => ok(w),
  encode: (p) => p,
}).seal();
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
const zero = defineKind({
  kind: 'amendment/zero',
  schema: z.string(),
  decode: (w) => ok(w),
  encode: (p) => p,
  allocate: () => 'x',
}).seal();
type ZeroArgs = Assert<Equal<Parameters<typeof zero.allocate>, []>>;
const emptyBuilder = defineDerived({
  kind: 'amendment/empty',
  derive: () => ok(0),
}).view({});
const empty = emptyBuilder.seal();
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
defineDerived({ kind: 'amendment/bad-encode', derive: (s: string) => ok(s) })
  .view({
    // @ts-expect-error descriptive reserved-name error on the configured field
    encode: (p) => p,
  })
  .seal();

defineDerived({ kind: 'amendment/symbol-type', derive: (s: string) => ok(s) })
  .view({
    // @ts-expect-error view cannot declare symbol protocol methods
    [Symbol.toPrimitive]: (p: string) => p,
  })
  .seal();
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
frozenBuilder.seal = frozenBuilder.seal;

const DocumentedUser = UserIdBuilder.docs({
  description: 'A user identifier.',
  examples: [
    {
      input: 'usr_0123456789abcdef',
      encoded: 'usr_0123456789abcdef',
      canonical: { type: 'utf8', value: 'usr_0123456789abcdef' },
    },
  ],
}).seal();
type DocumentedValue = Assert<
  Equal<ValueOf<typeof DocumentedUser>, ValueOf<typeof UserId>>
>;
DocumentedUser.allocate(() => 'usr_0123456789abcdef');
// @ts-expect-error Metadata remains read-only.
DocumentedUser.documentation.description = 'changed';
// @ts-expect-error Examples are required once semantic documentation is supplied.
NamespaceIdBuilder.docs({ description: 'Namespace' }).seal();
// @ts-expect-error At least one example is required.
NamespaceIdBuilder.docs({ examples: [] }).seal();
// @ts-expect-error Both input and encoded are required.
NamespaceIdBuilder.docs({ examples: [{ input: 'ns:x' }] }).seal();
// @ts-expect-error Input uses RawWire.
NamespaceIdBuilder.docs({ examples: [{ input: 1, encoded: 'ns:x' }] }).seal();
// @ts-expect-error Encoded also uses RawWire.
NamespaceIdBuilder.docs({ examples: [{ input: 'ns:x', encoded: 1 }] }).seal();
// @ts-expect-error Configured canonical must appear in every example.
UserIdBuilder.docs({ examples: [{ input: 'usr_x', encoded: 'usr_x' }] }).seal();
UserIdBuilder.docs({
  // @ts-expect-error Canonical has its exact result shape.
  examples: [{ input: 'usr_x', encoded: 'usr_x', canonical: { type: 'utf8' } }],
}).seal();
NamespaceIdBuilder.docs({
  // @ts-expect-error Canonical is absent when not configured.
  examples: [{ input: 'ns:x', encoded: 'ns:x', canonical: 'x' }],
}).seal();
UserIdBuilder.docs({
  // @ts-expect-error The independent fields have been removed.
  exampleWire: 'x',
  // @ts-expect-error Separate canonical examples were removed.
  exampleCanonical: { type: 'utf8', value: 'x' },
}).seal();
// @ts-expect-error All declared projections require documentation.
PreparedWriteBuilder.docs({ description: 'Plan' }).seal();
PreparedWriteBuilder.docs({
  // @ts-expect-error A projection description is required.
  view: { rows: {}, contentToRetain: { description: 'Content' } },
}).seal();
// @ts-expect-error Missing declared projection.
PreparedWriteBuilder.docs({ view: { rows: { description: 'Rows' } } }).seal();
PreparedWriteBuilder.docs({
  view: {
    rows: { description: 'Rows' },
    contentToRetain: { description: 'Content' },
    // @ts-expect-error Unknown projection is rejected.
    extra: { description: 'Wrong' },
  },
}).seal();
PreparedWriteBuilder.docs({
  view: {
    // @ts-expect-error Example must have the projection result type.
    rows: { description: 'Rows', example: 42 },
    contentToRetain: { description: 'Content' },
  },
}).seal();
// @ts-expect-error Derived definitions cannot have wire examples.
emptyBuilder.docs({ examples: [{ input: 'x', encoded: 'x' }] }).seal();
// @ts-expect-error Empty projections do not introduce view documentation.
emptyBuilder.docs({ view: { extra: { description: 'No projection' } } }).seal();
const compositeWire = {
  namespace_id: 'ns:example',
  content_class: 'primary' as const,
  digest: 'abcdef',
};
const compositeDocs = {
  examples: [{ input: compositeWire, encoded: compositeWire }] as const,
  view: {
    namespace: { description: 'Namespace' },
    contentClass: { description: 'Class', example: 'primary' as const },
    digest: { description: 'Digest' },
  },
};
ContentAddressBuilder.docs(compositeDocs).seal();
ContentAddressBuilder.docs({
  ...compositeDocs,
  examples: [
    // @ts-expect-error Nested documentation uses raw wire, not sealed children.
    { input: { ...compositeWire, namespace_id: user }, encoded: compositeWire },
  ],
}).seal();
// @ts-expect-error View properties are readonly.
address.view.contentClass = 'primary';
// @ts-expect-error Projection values are not methods.
address.view.contentClass();
defineDerived({
  kind: 'invalid/old-fields',
  derive: () => ok(0),
  // @ts-expect-error Removed configuration spelling.
  fields: {},
}).seal();

const unfinishedValue = defineKind({
  kind: 'diagnostic/unfinished-value',
  schema: z.string(),
  decode: (value) => ok(value),
  encode: (p) => p,
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
unfinishedValue.seal = unfinishedValue.seal;
const finishedValue = unfinishedValue.seal();
type FinishedEncoding = Assert<
  Equal<ReturnType<ValueOf<typeof finishedValue>['encode']>, string>
>;

// Documentation prerequisites remain errors for variables as well as literals.
const missingCanonical = { exampleCanonical: { type: 'utf8', value: 'x' } };
// @ts-expect-error A message-bearing type must still reject unsupported examples.
NamespaceIdBuilder.docs(missingCanonical).seal();
// @ts-expect-error Derived canonical documentation is prohibited.
PreparedWriteBuilder.docs({ exampleCanonical: { type: 'utf8', value: 'x' } }).seal();
defineKind({
  kind: 'diagnostic/any-input',
  // @ts-expect-error Any-input wire schemas remain prohibited.
  schema: z.any(),
  decode: (value) => ok(value),
});
assertValueLaws(UserId, {
  validWire: fc.string(),
  projectionMutators: {
    canonical: (value) => {
      type CanonicalInput = Assert<
        Equal<typeof value, { type: string; value: string }>
      >;
      value.value = 'probe';
    },
  },
});
assertDerivedLaws(PreparedWrite, {
  validInput: fc.constant<PrepareInput>({ rows: [], content: [] }),
  projectionMutators: {
    view: {
      rows: (value) => {
        type ViewInput = Assert<Equal<typeof value, readonly string[]>>;
      },
    },
  },
});
assertValueLaws(NamespaceId, {
  validWire: fc.string(),
  // @ts-expect-error An allocation generator needs an allocator.
  allocateArgs: fc.constant([]),
});
assertValueLaws(NamespaceId, {
  validWire: fc.string(),
  // @ts-expect-error A canonical mutator needs a canonical operation.
  projectionMutators: { canonical: () => {} },
});
assertDerivedLaws(PreparedWrite, {
  validInput: fc.constant<PrepareInput>({ rows: [], content: [] }),
  // @ts-expect-error A derived kind cannot have an encoder mutator.
  projectionMutators: { encode: () => {} },
});
assertValueLaws(NamespaceId, {
  validWire: fc.string(),
  // @ts-expect-error A view mutator needs a view.
  projectionMutators: { view: { missing: () => {} } },
});
assertDerivedLaws(PreparedWrite, {
  validInput: fc.constant<PrepareInput>({ rows: [], content: [] }),
  // @ts-expect-error Mutator names must refer to actual view projections.
  projectionMutators: { view: { missing: () => {} } },
});

defineDerived({
  kind: 'invalid/undefined-canonical',
  derive: () => ok(0),
  // @ts-expect-error Explicit undefined does not make a forbidden derived option valid.
  canonical: undefined,
});
defineDerived({
  kind: 'invalid/undefined-fields',
  derive: () => ok(0),
  // @ts-expect-error Explicit undefined does not restore the old fields option.
  fields: undefined,
});
interface NamedDerivedOptions {
  view: { length: (parts: string) => number };
}
const namedDerivedOptions: NamedDerivedOptions = { view: { length: (p) => p.length } };
const namedDerived = unfinishedDerived.view(namedDerivedOptions.view).seal();
type NamedProjection = Assert<
  Equal<ValueOf<typeof namedDerived>['view']['length'], number>
>;

// @ts-expect-error Documentation terminology matches the view definition and facade.
ContentAddressBuilder.docs({ views: { contentClass: { example: 'primary' } } }).seal();
const documentedDerived = PreparedWriteBuilder.docs({
  view: { rows: { description: 'Rows' }, contentToRetain: { description: 'Content' } },
}).seal();
type NoDerivedWireDocs = Assert<
  Equal<
    'examples' extends keyof typeof documentedDerived.documentation ? true : false,
    false
  >
>;
const basicDocumentation = NamespaceIdBuilder.docs({
  examples: [{ input: 'ns:x', encoded: 'ns:x' }],
}).seal();
type NoCanonicalDocs = Assert<
  Equal<
    'canonical' extends keyof (typeof basicDocumentation.documentation.examples)[0]
      ? true
      : false,
    false
  >
>;
type NoViewDocs = Assert<
  Equal<
    'view' extends keyof typeof basicDocumentation.documentation ? true : false,
    false
  >
>;

// @ts-expect-error Runtime result helpers are not part of the library API.
import { ok as removedOk, err as removedErr } from '../src/index.js';
// @ts-expect-error The structural contract is named ProducerResult.
import type { Result } from '../src/index.js';
const InlineResult = defineKind({
  kind: 'types/inline-result',
  schema: z.string(),
  decode: (spelling) =>
    spelling.length
      ? { ok: true, value: { spelling } }
      : {
          ok: false,
          error: {
            kind: 'types/inline-result',
            reason: 'invalid_parts',
            issues: ['Empty'],
          },
        },
  encode: (parts) => {
    type InlineParts = Assert<Equal<typeof parts, { spelling: string }>>;
    return parts.spelling;
  },
}).seal();

const directlyParsedUser = UserId.parseOrThrow('usr_0123456789abcdef');
const directlyParsedUserType: ValueOf<typeof UserId> = directlyParsedUser;
// @ts-expect-error parseOrThrow returns the exact semantic kind.
const wrongDirectKind: ValueOf<typeof Sha256Digest> = directlyParsedUser;
// @ts-expect-error Derived kinds have no wire parsing operation.
PreparedWrite.parseOrThrow('x');

// The builder exposes only configuration; the completed kind exposes acquisition.
// @ts-expect-error Builders cannot parse before seal.
unfinishedValue.parse('x');
// @ts-expect-error Completed kinds cannot add projections.
finishedValue.view({});
const documentedBuilder = unfinishedValue.docs({
  examples: [{ input: 'x', encoded: 'x' }],
});
// @ts-expect-error Configure views before documentation so its types describe the final view.
documentedBuilder.view({ text: (p: string) => p });
const ThrowingCanonical = defineKind({
  kind: 'types/throwing-canonical',
  schema: z.string(),
  decode: (s) => ok(s),
  encode: (p) => p,
  canonical: () => {
    throw new Error('Unavailable');
  },
}).seal();
type NeverCanonical = Assert<
  Equal<ReturnType<ValueOf<typeof ThrowingCanonical>['canonical']>, never>
>;
// @ts-expect-error The old factory name is no longer exported.
import { defineValue } from '../src/index.js';
