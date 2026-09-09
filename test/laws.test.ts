import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { z } from 'zod';
import { assertValueLaws, assertDerivedLaws } from '../src/laws.js';
import { defineValue, defineDerived, ok } from '../src/index.js';
import {
  UserId,
  Sha256Digest,
  NamespaceId,
  ContentAddress,
  PreparedWrite,
} from '../examples/reference.js';
const hex = (n: number) =>
  fc
    .array(fc.constantFrom(...'0123456789abcdef'), { minLength: n, maxLength: n })
    .map((a) => a.join(''));
const spelling = hex(32);
const uuid = spelling.map(
  (s) =>
    `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`,
);
const namespace = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), {
    minLength: 1,
    maxLength: 20,
  })
  .map((a) => `ns:${a.join('')}`);
const address = fc.record({
  namespace_id: namespace,
  content_class: fc.constantFrom('primary' as const, 'attachment' as const),
  digest: hex(64),
});
test('all semantic reference laws, aliases, and allocation', () => {
  assertValueLaws(UserId, {
    validWire: fc.oneof(
      spelling.map((s) => `usr_${s}`),
      uuid.map((s) => `user:${s}`),
    ),
    equivalentAliases: uuid.map((s) => [`user:${s}`, `usr_${s.replaceAll('-', '')}`]),
    allocateArgs: uuid.map((s) => [() => s] as [() => string]),
  });
  assertValueLaws(Sha256Digest, { validWire: hex(64) });
  assertValueLaws(NamespaceId, { validWire: namespace });
  assertValueLaws(ContentAddress, {
    validWire: address,
    sealedKinds: [NamespaceId, Sha256Digest],
  });
});
test('derived reference laws include copies of graphs with sealed nodes', () => {
  const sealed = address.map((w) => {
    const r = ContentAddress.parse(w);
    if (!r.ok) throw Error();
    return r.value;
  });
  assertDerivedLaws(PreparedWrite, {
    sealedKinds: [ContentAddress],
    validInput: fc.record({
      rows: fc.array(fc.record({ id: fc.string(), content: sealed })),
      content: fc.array(sealed),
    }),
  });
});
test('law harness detects shallow-copy leaks and incorrect equality', () => {
  const Leak = defineDerived({
    kind: 'law/leak',
    derive: (x: number) => ok({ nested: { x } }),
  }).with({ view: { bad: (p) => ({ nested: p.nested }) } });
  assert.throws(
    () => assertDerivedLaws(Leak, { validInput: fc.integer() }),
    (e: any) => /projection leaked/.test(String(e.cause)),
  );
  const Wrong = defineValue({
    kind: 'law/wrong-equality',
    wire: z.int(),
    decode: (w) => ok(w),
  }).with({ toWireShape: (p) => p, equals: () => true });
  assert.throws(
    () => assertValueLaws(Wrong, { validWire: fc.integer() }),
    (e: any) => /custom equality/.test(String(e.cause)),
  );
});
test('custom mutable types require and support explicit mutators', () => {
  const Dates = defineDerived({
    kind: 'law/dates',
    derive: (x: number) => ok({ time: x }),
  }).with({ view: { date: (p) => new Date(p.time) } });
  assert.throws(
    () => assertDerivedLaws(Dates, { validInput: fc.integer() }),
    (e: any) => /projectionMutator/.test(String(e.cause)),
  );
  assertDerivedLaws(Dates, {
    validInput: fc.integer(),
    projectionMutators: { view: { date: (d) => d.setTime(0) } },
  });
});
test('law harness rejects non-finite wire numbers and preserves negative zero', () => {
  const Numbers = defineValue({
    kind: 'law/numbers',
    wire: z.custom<number>((x) => typeof x === 'number'),
    decode: (w) => ok(w),
  }).with({ toWireShape: (p) => p });
  assertValueLaws(Numbers, { validWire: fc.constantFrom(-0, 0, 1, -1) });
  for (const bad of [NaN, Infinity, -Infinity])
    assert.throws(
      () => assertValueLaws(Numbers, { validWire: fc.constant(bad) }),
      (e: any) => /finite/.test(String(e.cause)),
    );
});
test('objects resembling sealed instances are not silently skipped', () => {
  class Lookalike {
    #count = 0;
    equals() {
      return true;
    }
    debug() {
      return String(this.#count);
    }
    [Symbol.toPrimitive]() {
      return 'custom';
    }
    change() {
      this.#count++;
    }
  }
  const K = defineDerived({
    kind: 'law/lookalike',
    derive: () => ok(new Lookalike()),
  }).with({ view: { custom: (p) => p } });
  assert.throws(
    () => assertDerivedLaws(K, { validInput: fc.constant(undefined) }),
    (e: any) => /projectionMutator/.test(String(e.cause)),
  );
});
test('sealed children require explicit private-brand predicates', () => {
  const Child = defineDerived({ kind: 'law/child', derive: (n: number) => ok(n) }).with(
    {},
  );
  const Parent = defineDerived({
    kind: 'law/parent',
    derive: (n: number) => {
      const r = Child.derive(n);
      if (!r.ok) throw Error();
      return ok({ child: r.value });
    },
  }).with({ view: { child: (p) => p.child } });
  assert.throws(
    () => assertDerivedLaws(Parent, { validInput: fc.integer() }),
    (e: any) => /sealedKinds/.test(String(e.cause)),
  );
  assertDerivedLaws(Parent, { validInput: fc.integer(), sealedKinds: [Child] });
});
test('frozen detached canonical objects and field containers satisfy mutation laws', () => {
  const K = defineValue({
    kind: 'law/frozen-canonical',
    wire: z.string(),
    decode: (w) => ok({ text: w }),
  }).with({
    toWireShape: (p) => p.text,
    canonical: (p) => Object.freeze({ type: 'utf8' as const, value: p.text }),
    view: {
      list: (p) => Object.freeze([{ text: p.text }]),
      nested: (p) => Object.freeze({ child: { text: p.text } }),
      sealed: (p) => Object.seal([p.text]),
      fixedLength: (p) =>
        Object.defineProperty([p.text], 'length', { writable: false }),
    },
  });
  assertValueLaws(K, { validWire: fc.string() });
});
test('frozen outer objects and arrays do not hide mutable child aliases', () => {
  for (const shape of ['object', 'array'] as const) {
    const K = defineDerived({
      kind: `law/frozen-leak-${shape}`,
      derive: (n: number) => ok({ child: { n } }),
    }).with({
      view: {
        leak: (p) =>
          shape === 'object'
            ? Object.freeze({ child: p.child })
            : Object.freeze([p.child]),
      },
    });
    assert.throws(
      () => assertDerivedLaws(K, { validInput: fc.integer() }),
      (e: any) => /projection leaked/.test(String(e.cause)),
    );
  }
});
test('functions require mutators and function property aliases are observed', () => {
  const makeFunction = (n: number) => Object.assign(() => {}, { child: { n } });
  const Safe = defineDerived({
    kind: 'law/function-copy',
    derive: (n: number) => ok(n),
  }).with({ view: { callback: (p) => makeFunction(p) } });
  assert.throws(
    () => assertDerivedLaws(Safe, { validInput: fc.integer() }),
    (e: any) => /Function-valued projections require/.test(String(e.cause)),
  );
  const mutation = {
    view: {
      callback: (fn: ReturnType<typeof makeFunction>) => {
        fn.child.n++;
      },
    },
  };
  assertDerivedLaws(Safe, { validInput: fc.integer(), projectionMutators: mutation });
  const Leak = defineDerived({
    kind: 'law/function-leak',
    derive: (n: number) => ok(makeFunction(n)),
  }).with({ view: { callback: (p) => p } });
  assert.throws(
    () =>
      assertDerivedLaws(Leak, {
        validInput: fc.integer(),
        projectionMutators: mutation,
      }),
    (e: any) => /projection leaked/.test(String(e.cause)),
  );
  const Nested = defineDerived({
    kind: 'law/function-nested',
    derive: (n: number) => ok(n),
  }).with({ view: { callback: (p) => Object.freeze({ fn: makeFunction(p) }) } });
  assert.throws(
    () => assertDerivedLaws(Nested, { validInput: fc.integer() }),
    (e: any) => /Function-valued projections require/.test(String(e.cause)),
  );
});

test('accessor projections require a mutator before getters can run', () => {
  let reads = 0;
  const K = defineDerived({
    kind: 'law/accessor-required',
    derive: (n: number) => ok({ child: { n } }),
  }).with({
    view: {
      child: (p) =>
        Object.freeze({
          get nested() {
            reads++;
            return p.child;
          },
        }),
    },
  });
  assert.throws(
    () => assertDerivedLaws(K, { validInput: fc.integer() }),
    (e: any) =>
      /Accessor-containing projections require an explicit projectionMutator/.test(
        String(e.cause),
      ),
  );
  assert.equal(reads, 0);
  assert.throws(
    () =>
      assertDerivedLaws(K, {
        validInput: fc.integer(),
        projectionMutators: {
          view: {
            child: (v) => {
              v.nested.n++;
            },
          },
        },
      }),
    (e: any) => /projection leaked mutable Parts/.test(String(e.cause)),
  );
});

test('explicit accessor mutators support detached getters and nested accessor graphs', () => {
  const Safe = defineDerived({
    kind: 'law/accessor-copy',
    derive: (n: number) => ok({ n }),
  }).with({
    view: {
      child: (p) => ({
        container: Object.freeze({
          get nested() {
            return { n: p.n };
          },
        }),
      }),
    },
  });
  assert.throws(
    () => assertDerivedLaws(Safe, { validInput: fc.integer() }),
    (e: any) => /Accessor-containing projections/.test(String(e.cause)),
  );
  assertDerivedLaws(Safe, {
    validInput: fc.integer(),
    projectionMutators: {
      view: {
        child: (v) => {
          v.container.nested.n++;
        },
      },
    },
  });
  const Setter = defineDerived({
    kind: 'law/setter-required',
    derive: (n: number) => ok(n),
  }).with({
    view: { child: () => Object.defineProperty({}, 'hidden', { set(_x: unknown) {} }) },
  });
  assert.throws(
    () => assertDerivedLaws(Setter, { validInput: fc.integer() }),
    (e: any) => /Accessor-containing projections/.test(String(e.cause)),
  );
});
