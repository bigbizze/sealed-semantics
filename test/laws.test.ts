import { ok, err } from './result.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { z } from 'zod';
import { assertValueLaws, assertMintedLaws } from '../src/laws.js';
import { defineKind, defineMinted } from '../src/index.js';
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
test('minted reference laws include copies of graphs with sealed nodes', () => {
  const sealed = address.map((w) => {
    return ContentAddress.codec.parse(w);
  });
  assertMintedLaws(PreparedWrite, {
    sealedKinds: [ContentAddress],
    validInput: fc.record({
      rows: fc.array(fc.record({ id: fc.string(), content: sealed })),
      content: fc.array(sealed),
    }),
  });
});
test('law harness detects shallow-copy leaks and incorrect equality', () => {
  const Leak = defineMinted({
    kind: 'law/leak',
    mint: (x: number) => ok({ nested: { x } }),
  })
    .view({ bad: (p) => ({ nested: p.nested }) })
    .seal();
  assert.throws(
    () => assertMintedLaws(Leak, { validInput: fc.integer() }),
    (e: any) => /projection leaked/.test(String(e.cause)),
  );
  const Wrong = defineKind({
    kind: 'law/wrong-equality',
    schema: z.int(),
    equals: () => true,
  }).seal();
  assert.throws(
    () => assertValueLaws(Wrong, { validWire: fc.integer() }),
    (e: any) => /custom equality/.test(String(e.cause)),
  );
});
test('custom mutable types require and support explicit mutators', () => {
  const Dates = defineMinted({
    kind: 'law/dates',
    mint: (x: number) => ok({ time: x }),
  })
    .view({ date: (p) => new Date(p.time) })
    .seal();
  assert.throws(
    () => assertMintedLaws(Dates, { validInput: fc.integer() }),
    (e: any) => /projectionMutator/.test(String(e.cause)),
  );
  assertMintedLaws(Dates, {
    validInput: fc.integer(),
    projectionMutators: { view: { date: (d) => d.setTime(0) } },
  });
});
test('law harness rejects non-finite wire numbers and preserves negative zero', () => {
  const Numbers = defineKind({
    kind: 'law/numbers',
    schema: z.custom<number>((x) => typeof x === 'number'),
  }).seal();
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
  const K = defineMinted({ kind: 'law/lookalike', mint: () => ok(new Lookalike()) })
    .view({ custom: (p) => p })
    .seal();
  assert.throws(
    () => assertMintedLaws(K, { validInput: fc.constant(undefined) }),
    (e: any) => /projectionMutator/.test(String(e.cause)),
  );
});
test('sealed children require explicit private-brand predicates', () => {
  const Child = defineMinted({
    kind: 'law/child',
    mint: (n: number) => ok(n),
  }).seal();
  const Parent = defineMinted({
    kind: 'law/parent',
    mint: (n: number) => {
      const r = Child.mint(n);
      if (!r.ok) throw Error();
      return ok({ child: r.value });
    },
  })
    .view({ child: (p) => p.child })
    .seal();
  assert.throws(
    () => assertMintedLaws(Parent, { validInput: fc.integer() }),
    (e: any) => /sealedKinds/.test(String(e.cause)),
  );
  assertMintedLaws(Parent, { validInput: fc.integer(), sealedKinds: [Child] });
});
test('frozen detached view objects and containers satisfy mutation laws', () => {
  const K = defineKind({
    kind: 'law/frozen-view',
    schema: z.string(),
  })
    .view({
      list: (p) => Object.freeze([{ text: p }]),
      nested: (p) => Object.freeze({ child: { text: p } }),
      sealed: (p) => Object.seal([p]),
      fixedLength: (p) => Object.defineProperty([p], 'length', { writable: false }),
    })
    .seal();
  assertValueLaws(K, { validWire: fc.string() });
});
test('frozen outer objects and arrays do not hide mutable child aliases', () => {
  for (const shape of ['object', 'array'] as const) {
    const K = defineMinted({
      kind: `law/frozen-leak-${shape}`,
      mint: (n: number) => ok({ child: { n } }),
    })
      .view({
        leak: (p) =>
          shape === 'object'
            ? Object.freeze({ child: p.child })
            : Object.freeze([p.child]),
      })
      .seal();
    assert.throws(
      () => assertMintedLaws(K, { validInput: fc.integer() }),
      (e: any) => /projection leaked/.test(String(e.cause)),
    );
  }
});
test('functions require mutators and function property aliases are observed', () => {
  const makeFunction = (n: number) => Object.assign(() => {}, { child: { n } });
  const Safe = defineMinted({
    kind: 'law/function-copy',
    mint: (n: number) => ok(n),
  })
    .view({ callback: (p) => makeFunction(p) })
    .seal();
  assert.throws(
    () => assertMintedLaws(Safe, { validInput: fc.integer() }),
    (e: any) => /Function-valued projections require/.test(String(e.cause)),
  );
  const mutation = {
    view: {
      callback: (fn: ReturnType<typeof makeFunction>) => {
        fn.child.n++;
      },
    },
  };
  assertMintedLaws(Safe, { validInput: fc.integer(), projectionMutators: mutation });
  const Leak = defineMinted({
    kind: 'law/function-leak',
    mint: (n: number) => ok(makeFunction(n)),
  })
    .view({ callback: (p) => p })
    .seal();
  assert.throws(
    () =>
      assertMintedLaws(Leak, {
        validInput: fc.integer(),
        projectionMutators: mutation,
      }),
    (e: any) => /projection leaked/.test(String(e.cause)),
  );
  const Nested = defineMinted({
    kind: 'law/function-nested',
    mint: (n: number) => ok(n),
  })
    .view({ callback: (p) => Object.freeze({ fn: makeFunction(p) }) })
    .seal();
  assert.throws(
    () => assertMintedLaws(Nested, { validInput: fc.integer() }),
    (e: any) => /Function-valued projections require/.test(String(e.cause)),
  );
});

test('accessor projections require a mutator before getters can run', () => {
  let reads = 0;
  const K = defineMinted({
    kind: 'law/accessor-required',
    mint: (n: number) => ok({ child: { n } }),
  })
    .view({
      child: (p) =>
        Object.freeze({
          get nested() {
            reads++;
            return p.child;
          },
        }),
    })
    .seal();
  assert.throws(
    () => assertMintedLaws(K, { validInput: fc.integer() }),
    (e: any) =>
      /Accessor-containing projections require an explicit projectionMutator/.test(
        String(e.cause),
      ),
  );
  assert.equal(reads, 0);
  assert.throws(
    () =>
      assertMintedLaws(K, {
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
  const Safe = defineMinted({
    kind: 'law/accessor-copy',
    mint: (n: number) => ok({ n }),
  })
    .view({
      child: (p) => ({
        container: Object.freeze({
          get nested() {
            return { n: p.n };
          },
        }),
      }),
    })
    .seal();
  assert.throws(
    () => assertMintedLaws(Safe, { validInput: fc.integer() }),
    (e: any) => /Accessor-containing projections/.test(String(e.cause)),
  );
  assertMintedLaws(Safe, {
    validInput: fc.integer(),
    projectionMutators: {
      view: {
        child: (v) => {
          v.container.nested.n++;
        },
      },
    },
  });
  const Setter = defineMinted({
    kind: 'law/setter-required',
    mint: (n: number) => ok(n),
  })
    .view({ child: () => Object.defineProperty({}, 'hidden', { set(_x: unknown) {} }) })
    .seal();
  assert.throws(
    () => assertMintedLaws(Setter, { validInput: fc.integer() }),
    (e: any) => /Accessor-containing projections/.test(String(e.cause)),
  );
});
