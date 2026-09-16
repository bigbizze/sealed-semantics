import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { z } from 'zod';
import * as fc from 'fast-check';
import { defineSeal, defineMint } from '../src/index.js';
import { assertValueLaws, assertMintedLaws } from '../src/laws.js';

test('copy observations snapshot once and isolate producer and consumer storage', () => {
  let calls = 0;
  let leaked!: Uint8Array;
  const K = defineSeal({ name: 'copy/owned', schema: z.string(), key: (s) => s })
    .copy({
      bytes: (s) => {
        calls++;
        leaked = new TextEncoder().encode(s);
        return leaked;
      },
    })
    .view({ text: (s) => s })
    .seal();
  const value = K.codec.parse('abc');
  assert.equal(calls, 0);
  assert(!('copy' in value));
  assert(!('copy' in K));
  const detached = K.bytes;
  const first = detached(value);
  assert.notEqual(first, leaked);
  assert.notEqual(first.buffer, leaked.buffer);
  leaked[0] = 255;
  first[1] = 255;
  const second = detached(value);
  const third = K.bytes(value);
  assert.deepEqual(second, new Uint8Array([97, 98, 99]));
  assert.deepEqual(second, third);
  assert.notEqual(second, third);
  assert.notEqual(second.buffer, third.buffer);
  assert.equal(calls, 1);
  assert.equal(K.codec.parse('abc'), value);
  assert.equal(K.text(value), 'abc');
  assert.equal(z.encode(K.codec, value), 'abc');
  assert.throws(() => JSON.stringify(value));
  assert.throws(() => K.bytes({}), /bytes.*expected a sealed/);
});

test('each mint event and observation has its own lazy snapshot, including empty bytes', () => {
  let calls = 0;
  const M = defineMint({ name: 'copy/mint', mint: () => ({ ok: true, value: 0 }) })
    .copy({
      bytes: () => {
        calls++;
        return new Uint8Array(0);
      },
      other: () => {
        calls++;
        return new Uint8Array([1]);
      },
    })
    .seal();
  const a = M.mint(undefined),
    b = M.mint(undefined);
  assert(a.ok && b.ok);
  assert.notEqual(M.bytes(a.value), M.bytes(a.value));
  assert.equal(calls, 1);
  M.bytes(b.value);
  M.other(a.value);
  assert.equal(calls, 3);
  for (const Kind of [
    defineSeal({ name: 'copy/none', schema: z.string(), key: (s) => s }).seal(),
    defineSeal({ name: 'copy/empty', schema: z.string(), key: (s) => s })
      .copy({})
      .seal(),
  ]) {
    assert(!('copy' in Kind.codec.parse('x')));
    assert(!('bytes' in Kind));
  }
});

test('Buffer, subarrays and cross-realm bytes become plain independent Uint8Arrays', () => {
  for (const source of [
    Buffer.from([1, 2, 3]),
    new Uint8Array([0, 1, 2, 3, 0]).subarray(1, 4),
    runInNewContext('new Uint8Array([1,2,3])') as Uint8Array,
  ]) {
    const M = defineMint({ name: 'copy/binary', mint: () => ({ ok: true, value: 0 }) })
      .copy({ bytes: () => source })
      .seal();
    const r = M.mint(undefined);
    assert(r.ok);
    const first = M.bytes(r.value);
    assert.equal(Object.getPrototypeOf(first), Uint8Array.prototype);
    assert.deepEqual(first, new Uint8Array([1, 2, 3]));
    assert.notEqual(first.buffer, source.buffer);
    source[0] = 99;
    assert.deepEqual(M.bytes(r.value), first);
  }
});

test('invalid byte outputs fail without reading properties or exposing Parts', () => {
  let reads = 0;
  const shared = new Uint8Array(new SharedArrayBuffer(1));
  Object.defineProperty(shared, 'buffer', {
    get() {
      reads++;
      return new ArrayBuffer(1);
    },
  });
  const forged = Object.create(Uint8Array.prototype);
  for (const output of [
    null,
    undefined,
    'secret',
    1,
    [],
    {},
    new Date(),
    new Map(),
    new Set(),
    new ArrayBuffer(1),
    new DataView(new ArrayBuffer(1)),
    new Uint32Array(1),
    new Uint8ClampedArray(1),
    () => 1,
    Promise.resolve(1),
    shared,
    forged,
    new Proxy(new Uint8Array(1), {}),
    {
      [Symbol.toStringTag]: 'Uint8Array',
      get buffer() {
        reads++;
        return new ArrayBuffer(1);
      },
    },
  ]) {
    const M = defineMint({
      name: 'copy/invalid',
      mint: () => ({ ok: true, value: 'private-parts' }),
    })
      .copy({ bytes: () => output } as any)
      .seal();
    const r = M.mint(undefined);
    assert(r.ok);
    assert.throws(
      () => (M as any).bytes(r.value),
      (err) =>
        err instanceof TypeError &&
        /copy\/invalid\.bytes/.test(err.message) &&
        /Uint8Array/.test(err.message) &&
        !err.message.includes('private-parts'),
    );
  }
  assert.equal(reads, 0);
  const detached = new Uint8Array(1);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  const M = defineMint({ name: 'copy/detached', mint: () => ({ ok: true, value: 0 }) })
    .copy({ bytes: () => detached })
    .seal();
  const r = M.mint(undefined);
  assert(r.ok);
  assert.throws(() => M.bytes(r.value), /attached and readable/);
});

test('failed producers and validation retry; recursion is rejected and can recover', () => {
  let calls = 0;
  let action: () => unknown = () => {
    throw new Error('retry');
  };
  const config = {
    bytes: () => {
      calls++;
      return action();
    },
  };
  const B = defineSeal({ name: 'copy/retry', schema: z.string(), key: (s) => s }).copy(
    config as any,
  );
  config.bytes = () => new Uint8Array([99]);
  const K = B.seal();
  const bytes = (K as any).bytes as (value: unknown) => Uint8Array;
  const value = K.codec.parse('x');
  assert.throws(() => bytes(value), /retry/);
  action = () => 'invalid';
  assert.throws(() => bytes(value), /must return a genuine Uint8Array/);
  action = () => bytes(value);
  assert.throws(() => bytes(value), /recursive copy observation/);
  action = () => new Uint8Array([1]);
  assert.deepEqual(bytes(value), new Uint8Array([1]));
  bytes(value);
  assert.equal(calls, 4);
  for (const invalid of [
    null,
    { bytes: 1 },
    { then: () => 1 },
    { [Symbol()]: () => 1 },
  ])
    assert.throws(() => B.copy(invalid as any));
});

test('docs, view and copy compose in any order; laws verify byte isolation', () => {
  const B = defineSeal({ name: 'copy/docs', schema: z.string(), key: (s) => s });
  const docs = {
    examples: [{ input: 'abc', encoded: 'abc' }] as const,
    copy: { bytes: { description: 'UTF-8 bytes.' } },
    view: { text: { description: 'Text.' } },
  };
  const copies = { bytes: (s: string) => new TextEncoder().encode(s) };
  const view = { text: (s: string) => s };
  for (const K of [
    B.docs(docs).copy(copies).view(view).seal(),
    B.copy(copies).view(view).docs(docs).seal(),
    B.view(view).docs(docs).copy(copies).seal(),
  ]) {
    assert.deepEqual(K.bytes(K.codec.parse('abc')), new Uint8Array([97, 98, 99]));
    assertValueLaws(K, { validWire: fc.string() });
    assert(!('copy' in K));
    assert(Object.isFrozen(K.documentation.copy.bytes));
  }
  assert.throws(
    () =>
      (
        B.copy(copies).docs({
          examples: [{ input: 'x', encoded: 'x' }],
        } as any) as any
      ).seal(),
    /copy/,
  );
  const M = defineMint({
    name: 'copy/laws',
    mint: (s: string) => ({ ok: true, value: s }),
  })
    .copy(copies)
    .seal();
  assertMintedLaws(M, { validInput: fc.string() });
});
