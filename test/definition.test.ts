import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { defineValue, defineDerived, ok } from '../src/index.js';

test('invalid semantic options fail before a kind is reserved', () => {
  const builder = () =>
    defineValue({
      kind: 'validation/semantic',
      wire: z.string(),
      decode: (w) => ok(w),
    });
  for (const options of [
    null,
    [],
    {},
    { toWireShape: 1 },
    { toWireShape: undefined },
    { toWireShape: (p: string) => p, canoncal: () => 1 },
    { toWireShape: (p: string) => p, equals: false },
    { toWireShape: (p: string) => p, allocate: 3 },
    { toWireShape: (p: string) => p, canonical: null },
    { toWireShape: (p: string) => p, debug: 'text' },
    { toWireShape: (p: string) => p, view: null },
    { toWireShape: (p: string) => p, view: { text: 1 } },
  ]) {
    assert.throws(() => builder().with(options as any), TypeError);
  }
  assert.throws(
    () => builder().with({ toWireShape: (p: string) => p, canoncal: () => 1 } as any),
    /Unknown options property "canoncal"/,
  );
  const K = builder().with({ toWireShape: (p) => p });
  assert(K.parse('valid').ok);
});
test('invalid derived options fail before a kind is reserved', () => {
  const builder = () =>
    defineDerived({ kind: 'validation/derived', derive: (s: string) => ok(s) });
  for (const options of [
    null,
    [],
    { canonical: () => 1 },
    { wire: z.string() },
    { allocate: () => '' },
    { equals: () => true },
    { debug: undefined },
    { view: { text: null } },
    { typo: () => 0 },
  ]) {
    assert.throws(() => builder().with(options as any), TypeError);
  }
  assert(builder().with({}).derive('valid').ok);
});
test('producer declarations require known keys, schemas, and callback types', () => {
  const kind = 'validation/producer';
  for (const spec of [
    null,
    [],
    { kind, wire: z.string() },
    { kind, wire: {}, decode: () => ok(1) },
    { kind, wire: z.string(), decode: null },
    { kind, wire: z.string(), decode: () => ok(1), extra: true },
  ]) {
    assert.throws(() => defineValue(spec as any), TypeError);
  }
  for (const spec of [
    null,
    [],
    { kind },
    { kind, derive: 42 },
    { kind, derive: () => ok(1), wire: z.string() },
  ]) {
    assert.throws(() => defineDerived(spec as any), TypeError);
  }
  assert(
    defineValue({ kind, wire: z.string(), decode: (w) => ok(w) })
      .with({ toWireShape: (p) => p })
      .parse('x').ok,
  );
});
test('configuration accessors, hidden properties, and symbols are rejected without calling getters', () => {
  const builder = () =>
    defineValue({
      kind: 'validation/descriptors',
      wire: z.string(),
      decode: (w) => ok(w),
    });
  let called = false;
  const accessor = {
    toWireShape: (p: string) => p,
    get canonical() {
      called = true;
      return () => 0;
    },
  };
  const hidden = Object.defineProperty({ toWireShape: (p: string) => p }, 'canoncal', {
    value: () => 0,
  });
  for (const options of [
    accessor,
    hidden,
    { toWireShape: (p: string) => p, [Symbol('typo')]: () => 0 },
  ])
    assert.throws(() => builder().with(options as any), TypeError);
  assert.equal(called, false);
  assert(
    builder()
      .with({ toWireShape: (p) => p })
      .parse('x').ok,
  );
});

test('the former fields option is rejected before kind registration', () => {
  const builder = defineDerived({ kind: 'validation/old-fields', derive: () => ok(0) });
  assert.throws(
    () => builder.with({ fields: {} } as any),
    /Unknown options property "fields"/,
  );
  assert(Object.isFrozen(builder.with({ view: {} })));
});
