import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import * as fc from 'fast-check';
import { defineSeal, defineMint } from '../src/index.js';
import { assertValueLaws, assertMintedLaws } from '../src/laws.js';

test('conversions are lazy, bound, uncached and return independently owned graphs', () => {
  let calls = 0;
  const child = { numbers: [1, 2] };
  const source = {
    a: child,
    b: child,
    bytes: new Uint8Array([3, 4]),
    date: new Date(123),
  };
  const M = defineMint({ name: 'to/owned', mint: () => ({ ok: true, value: source }) })
    .to({
      data: (p) => {
        calls++;
        return new Map([['data', p]]);
      },
    })
    .view({ numbers: (p) => p.a.numbers })
    .seal();
  const r = M.mint(undefined);
  assert(r.ok);
  assert.equal(calls, 0);
  assert.equal(r.value.to, r.value.to);
  assert.equal(Object.getPrototypeOf(r.value.to), null);
  assert(Object.isFrozen(r.value.to));
  const detached = r.value.to.data;
  const first = detached(),
    second = detached();
  const a = first.get('data')!,
    b = second.get('data')!;
  assert.equal(calls, 2);
  assert.notEqual(a, b);
  assert.equal(a.a, a.b);
  assert.notEqual(a.a, source.a);
  a.a.numbers.push(9);
  a.bytes[0] = 99;
  a.date.setTime(0);
  assert.deepEqual(b, source);
  const frozen = r.value.view.numbers;
  assert(Object.isFrozen(frozen));
  const c = detached().get('data')!;
  c.a.numbers.push(8);
  assert.deepEqual(frozen, [1, 2]);
  assert.throws(
    () =>
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(r.value), 'to')!.get!.call(
        {},
      ),
    /to.*expected a sealed/,
  );
  assert.throws(() => JSON.stringify(r.value));
  const Empty = defineMint({ name: 'to/empty', mint: () => ({ ok: true, value: 1 }) })
    .to({})
    .seal();
  const empty = Empty.mint(undefined);
  assert(empty.ok);
  assert(!('to' in empty.value));
});

test('standard binary and collection copies preserve their data and detach backing memory', () => {
  const buffer = new ArrayBuffer(8);
  const bytes = new Uint8Array(buffer, 2, 3);
  bytes.set([1, 2, 3]);
  const source = {
    buffer,
    bytes,
    data: new DataView(buffer),
    map: new Map([[{ id: 1 }, new Set([2])]]),
  };
  const M = defineMint({ name: 'to/binary', mint: () => ({ ok: true, value: source }) })
    .to({ data: (p) => new Map([['data', p]]) })
    .seal();
  const r = M.mint(undefined);
  assert(r.ok);
  const copy = r.value.to.data().get('data')!;
  assert.equal(copy.bytes.buffer, copy.buffer);
  assert.equal(copy.data.buffer, copy.buffer);
  assert.notEqual(copy.buffer, buffer);
  copy.bytes[0] = 9;
  assert.equal(bytes[0], 1);
  assert.notEqual([...copy.map.keys()][0], [...source.map.keys()][0]);
});

test('unsafe conversion results are rejected before getters can run', () => {
  let reads = 0;
  const cycle: any = {};
  cycle.self = cycle;
  const Seal = defineSeal({
    name: 'to/leaf',
    schema: z.string(),
    key: (s) => s,
  }).seal();
  class Custom {
    x = 1;
  }
  const bad = [
    undefined,
    null,
    0,
    false,
    'text',
    [],
    {},
    Seal.codec.parse('x'),
    () => 1,
    Symbol(),
    new Custom(),
    Promise.resolve(1),
    new WeakMap(),
    Buffer.from([1]),
    new SharedArrayBuffer(1),
    new Uint8Array(new SharedArrayBuffer(1)),
    {
      get x() {
        reads++;
        return 1;
      },
    },
    { [Symbol()]: 1 },
    Object.defineProperty({}, 'x', { value: 1 }),
    Object.assign(new Date(), { extra: 1 }),
    Object.assign(new Uint8Array(1), { extra: 1 }),
    cycle,
  ];
  for (const value of bad) {
    const M = defineMint({ name: 'to/invalid', mint: () => ({ ok: true, value: 0 }) })
      .to({ data: () => value } as any)
      .seal();
    const r = M.mint(undefined);
    assert(r.ok);
    assert.throws(() => r.value.to.data!(), /to\/invalid.to.data/);
  }
  assert.equal(reads, 0);
});

test('conversion failure retries and definition configuration remains immutable', () => {
  let fail = true;
  const config = {
    data: (s: string) => {
      if (fail) throw new Error('retry');
      return new Set([s]);
    },
  };
  const B = defineSeal({ name: 'to/retry', schema: z.string(), key: (s) => s }).to(
    config,
  );
  config.data = () => new Set(['replaced']);
  const value = B.seal().codec.parse('x');
  assert.throws(() => value.to.data(), /retry/);
  fail = false;
  assert.deepEqual(value.to.data(), new Set(['x']));
  for (const to of [null, { data: 1 }, { then: () => 1 }, { [Symbol()]: () => 1 }])
    assert.throws(() => B.to(to as any));
});

test('docs and conversions can be configured in either order; laws cover copies', () => {
  const B = defineSeal({ name: 'to/docs', schema: z.string(), key: (s) => s });
  const docs = {
    examples: [{ input: 'abc', encoded: 'abc' }] as const,
    to: { bytes: { description: 'UTF-8 bytes.' } },
  };
  const conversions = { bytes: (s: string) => new TextEncoder().encode(s) };
  for (const K of [
    B.docs(docs).to(conversions).seal(),
    B.to(conversions).docs(docs).seal(),
  ]) {
    assert.deepEqual(K.codec.parse('abc').to.bytes(), new Uint8Array([97, 98, 99]));
    assertValueLaws(K, { validWire: fc.string() });
    assert(!('to' in K));
    assert(Object.isFrozen(K.documentation.to.bytes));
  }
  assert.throws(
    () =>
      (
        B.to(conversions).docs({
          examples: [{ input: 'x', encoded: 'x' }],
        } as any) as any
      ).seal(),
    /to/,
  );
  const M = defineMint({
    name: 'to/laws',
    mint: (s: string) => ({ ok: true, value: s }),
  })
    .to({ data: (s) => new Set([{ s }]) })
    .seal();
  assertMintedLaws(M, { validInput: fc.string() });
});
